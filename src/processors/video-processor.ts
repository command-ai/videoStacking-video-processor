import { prisma } from '../database/prisma-client.js'
import { uploadToR2 } from '../storage/r2-client.js'
import { logger } from '../utils/logger.js'
import { config } from '../config/environment.js'
import path from 'path'
import fs from 'fs/promises'
import { execSync } from 'child_process'

// Every ffmpeg/ffprobe/curl invocation is synchronous and blocks the event
// loop. Without a timeout, a stalled subprocess (hung download, wedged ffmpeg)
// freezes the render in "processing" forever with no error. Bounding each call
// makes it throw on overrun → the render fails cleanly and can be retried.
const SUBPROCESS_TIMEOUT_MS = Number(process.env.FFMPEG_TIMEOUT_MS) || 8 * 60 * 1000
function execSyncBounded(cmd: string, opts: Record<string, any> = {}): Buffer {
  return execSync(cmd, { timeout: SUBPROCESS_TIMEOUT_MS, killSignal: 'SIGKILL', ...opts }) as unknown as Buffer
}

// Overall ceiling for one render. A backstop above the per-subprocess timeouts:
// if anything async stalls (and isn't a blocking execSync), this marks the row
// failed instead of leaving it stuck in "processing".
const RENDER_WATCHDOG_MS = Number(process.env.RENDER_WATCHDOG_MS) || 12 * 60 * 1000

interface FrameOverride {
  duration?: number
  ffmpegFilters?: {
    brightness?: number
    contrast?: number
    saturation?: number
    blur?: number
  }
}

interface VideoProcessingOptions {
  onProgress?: (progress: { percent: number; stage: string }) => void
  adaptiveGraphics?: boolean
  keepTemp?: boolean
  preset?: string
  quality?: number
  /** Parallel to assets.images; one entry per image (or undefined). Item 4 & 5. */
  imageFrameOverrides?: Array<FrameOverride | undefined>
  /** Total duration override in seconds (Item 6). */
  targetDurationOverride?: number
}

interface VideoContext {
  platform?: string
  settings?: any
  targetDuration?: number
  // W1: the dispatching org, asserted against the video row so a caller can't
  // drive a render of a video belonging to a different organization.
  organizationId?: string
}

export async function processVideo(videoId: string, context?: VideoContext) {
  const startTime = Date.now()
  // Backstop: if the render runs past the ceiling (an async stall not caught by
  // the per-subprocess timeouts), flip the row to failed so it never lingers in
  // "processing". The work may still unwind, but the user-visible state is no
  // longer a zombie.
  let watchdog: NodeJS.Timeout | undefined = setTimeout(() => {
    watchdog = undefined
    logger.error(`Render watchdog fired for video ${videoId} after ${RENDER_WATCHDOG_MS}ms — marking failed`)
    prisma.video.updateMany({
      where: { id: videoId, status: 'processing' },
      data: { status: 'failed', error: `Render exceeded ${Math.floor(RENDER_WATCHDOG_MS / 1000)}s timeout`, completedAt: new Date() },
    }).catch((e) => logger.error('Watchdog failed to update row:', e))
  }, RENDER_WATCHDOG_MS)
  if (typeof watchdog.unref === 'function') watchdog.unref()

  try {
    // Debug: Check database connection and list videos
    logger.info('Database URL:', process.env.DATABASE_URL?.replace(/:[^@]+@/, ':***@'))
    const videoCount = await prisma.video.count()
    logger.info(`Total videos in database: ${videoCount}`)
    
    // 1. Get video details from database.
    // W1: when the dispatcher supplies an organizationId, scope the lookup to it
    // so a request can't drive a render of another org's video by id. Falls back
    // to an unscoped lookup only when no org context was provided (internal/legacy
    // callers), which W2's internal-token auth otherwise gates.
    const video = context?.organizationId
      ? await prisma.video.findFirst({
          where: { id: videoId, organizationId: context.organizationId }
        })
      : await prisma.video.findUnique({
          where: { id: videoId }
        })

    if (!video) {
      throw new Error(`Video ${videoId} not found`)
    }
    
    // 2. Update status to processing
    await prisma.video.update({
      where: { id: video.id },
      data: {
        status: 'processing',
        startedAt: new Date()
      }
    })
    
    logger.info(`Starting video generation for video ${videoId}`, {
      generationId: video.generationId,
      organizationId: video.organizationId,
      platform: video.platform,
      mediaIds: video.mediaIds
    })
    
    // 3. Get media files based on mediaIds
    const media = []
    if (video.mediaIds && video.mediaIds.length > 0) {
      const mediaRecords = await prisma.videoMedia.findMany({
        where: { id: { in: video.mediaIds } }
      })

      // Sort media records to match the order in video.mediaIds
      // Prisma findMany doesn't preserve the order of the input array
      const mediaMap = new Map(mediaRecords.map(m => [m.id, m]))
      const sortedMedia = video.mediaIds
        .map(id => mediaMap.get(id))
        .filter((m): m is NonNullable<typeof m> => m !== undefined)

      media.push(...sortedMedia)

      logger.info('Media order preserved in video processor:', {
        videoId: video.id,
        requestedOrder: video.mediaIds,
        resultOrder: sortedMedia.map(m => m.id),
        sortedFilenames: sortedMedia.map(m => m.filename)
      })
    }
    
    // 3. Prepare assets (and map per-frame overrides onto local paths)
    const assets = await prepareAssets(media)

    // 3a. Persist any non-fatal asset-prep degradations (skipped media) into
    //     video.metadata.warnings so a degraded-but-shipped render surfaces what
    //     was left out, instead of completing as a silent success. Best-effort.
    if (Array.isArray(assets.warnings) && assets.warnings.length > 0) {
      try {
        const row = await prisma.video.findUnique({ where: { id: videoId }, select: { metadata: true } })
        const metadata: any =
          row?.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
            ? { ...row.metadata }
            : {}
        const existing = Array.isArray(metadata.warnings)
          ? metadata.warnings.filter((w: unknown): w is string => typeof w === 'string')
          : []
        metadata.warnings = [...existing, ...assets.warnings]
        await prisma.video.update({ where: { id: videoId }, data: { metadata } })
      } catch (warnErr) {
        logger.warn('Failed to persist render warnings', {
          videoId,
          err: warnErr instanceof Error ? warnErr.message : String(warnErr),
        })
      }
    }

    // 3b. Resolve audio assets — background music and TTS voiceover.
    //
    // The frontend posts these under `settings.soundtrack.music` and
    // `settings.voiceover`. The API layer (videoQueueService) is responsible
    // for resolving abstract sources ('brand-kit' / 'library' / 'upload' /
    // 'generate-from-script') into concrete URLs / S3 keys BEFORE dispatching
    // here. Once we have a URL or s3Key, we download to a local temp file so
    // FFmpegRenderer can consume it like any other asset.
    //
    // Without this block, every base render produced silent video regardless
    // of UI selection (the previous TODO at this site was never wired up).
    const audioSettings = {
      ...((video.settings as any) || {}),
      ...((context?.settings as any) || {}),
    }
    const audioWorkDir = path.join(config.TEMP_DIR || './temp', `audio-${video.id}`)
    await fs.mkdir(audioWorkDir, { recursive: true })
    assets.backgroundMusic = await resolveAudioAsset(
      audioSettings?.soundtrack?.music,
      audioWorkDir,
      'music',
    )
    assets.voiceOver = await resolveAudioAsset(
      audioSettings?.voiceover,
      audioWorkDir,
      'voiceover',
    )
    if (assets.backgroundMusic || assets.voiceOver) {
      logger.info('Audio assets resolved for base render', {
        videoId,
        hasMusic: !!assets.backgroundMusic,
        hasVoiceover: !!assets.voiceOver,
      })
    }

    // 4. Import VideoGenerator through ES module wrapper
    const { default: VideoGenerator } = await import('../core/VideoGeneratorWrapper.js')
    
    // 5. Initialize video generator with core FFMPEG code
    const generator = new VideoGenerator({
      ffmpegPath: config.FFMPEG_PATH || 'ffmpeg',
      ffprobePath: config.FFPROBE_PATH || 'ffprobe',
      tempDir: config.TEMP_DIR || './temp',
      outputDir: path.join(config.TEMP_DIR || './temp', 'output')
    })
    
    // 6. Generate video using platform template with context
    const videoSettings = (video.settings as any) || {}
    const contextSettings = (context?.settings as any) || {}
    const combinedSettings: any = {
      ...videoSettings,
      ...contextSettings,
      targetDuration: context?.targetDuration || video.targetDuration,
      layoutMode: context?.settings?.layoutMode || 'letterbox'  // Default to letterbox
    }

    // Item 6 — global duration override wins over the platform-derived value.
    if (typeof combinedSettings.targetDurationOverride === 'number' && combinedSettings.targetDurationOverride > 0) {
      combinedSettings.targetDuration = combinedSettings.targetDurationOverride
    }

    // Items 4 & 5 — normalize per-frame overrides into a mediaId-keyed map
    // for O(1) lookup in the FFmpeg renderer. Positional entries (no
    // mediaId) are aligned to the video's mediaIds array by index.
    const rawFrames = Array.isArray(combinedSettings.frames) ? combinedSettings.frames : []
    const frameOverridesByMediaId: Record<string, { duration?: number; ffmpegFilters?: Record<string, number> }> = {}
    if (rawFrames.length > 0 && video.mediaIds && video.mediaIds.length > 0) {
      for (let i = 0; i < rawFrames.length; i++) {
        const entry = rawFrames[i] || {}
        const mediaId: string | undefined = entry.mediaId || video.mediaIds[i]
        if (!mediaId) continue
        const override: { duration?: number; ffmpegFilters?: Record<string, number> } = {}
        if (typeof entry.duration === 'number' && entry.duration > 0) {
          override.duration = entry.duration
        }
        if (entry.ffmpegFilters && typeof entry.ffmpegFilters === 'object') {
          override.ffmpegFilters = entry.ffmpegFilters
        }
        if (override.duration !== undefined || override.ffmpegFilters) {
          frameOverridesByMediaId[mediaId] = override
        }
      }
    }

    logger.info(`Generating video with settings:`, {
      platform: context?.platform || video.platform,
      targetDuration: combinedSettings.targetDuration,
      targetDurationOverride: combinedSettings.targetDurationOverride,
      layoutMode: combinedSettings.layoutMode,
      preset: combinedSettings.preset || 'fast',
      frameOverrideCount: Object.keys(frameOverridesByMediaId).length
    })
    
    // Build a per-image overrides array aligned to assets.images — one
    // slot per image (or undefined for no overrides). The renderer uses
    // this to inject per-frame FFmpeg filter chains and duration values.
    const imageFrameOverrides: Array<{ duration?: number; ffmpegFilters?: Record<string, number> } | undefined> = []
    if (Array.isArray(assets.imageMediaIds) && Object.keys(frameOverridesByMediaId).length > 0) {
      for (const mediaId of assets.imageMediaIds) {
        imageFrameOverrides.push(frameOverridesByMediaId[mediaId] || undefined)
      }
    }

    // Music-over-intro: FFmpeg is linear. The body slideshow is rendered first,
    // then the intro is concatenated in FRONT of it (prependIntroSegments). If
    // the background music is baked into the body it inherits the body's start
    // and plays BEHIND the intro (the reported bug). So when an intro is
    // configured we DEFER the music: render the body without it, then mix the
    // looped, ducked bed over the whole [intro+body] timeline in a final pass
    // (mixMusicOverFull). This matches the Remotion engine, where composition-
    // level audio already spans every slot including the intro. The voiceover
    // stays baked in the body — its body-relative timing is already correct, and
    // it becomes the sidechain key that ducks the bed in the final pass.
    const introConfigured = !!(
      combinedSettings?.intro &&
      ((Array.isArray(combinedSettings.intro.segments) &&
        combinedSettings.intro.segments.some((s: any) => s && s.url)) ||
        (typeof combinedSettings.intro.url === 'string' && combinedSettings.intro.url) ||
        (typeof combinedSettings.introVideo === 'string' && combinedSettings.introVideo))
    )
    let deferredMusic: string | null = null
    if (introConfigured && assets.backgroundMusic) {
      deferredMusic = assets.backgroundMusic
      assets.backgroundMusic = null
      logger.info('Deferring background music to final pass (music spans intro)', { videoId })
    }

    const outputPath = await generator.generateVideo(
      context?.platform || video.platform,
      assets,
      {
        settings: combinedSettings,
        imageMode: combinedSettings.layoutMode || 'letterbox', // Map layoutMode to imageMode
        preset: combinedSettings.preset || 'fast', // Dynamic: ultrafast|veryfast|fast|medium
        quality: combinedSettings.crf || 23,
        adaptiveGraphics: true,
        // Items 4 & 5 — per-frame overrides indexed parallel to assets.images.
        imageFrameOverrides: imageFrameOverrides.length > 0 ? imageFrameOverrides : undefined,
        // Item 6 — already folded into combinedSettings.targetDuration above,
        // but also surfaced explicitly so the generator can distinguish a
        // user-chosen total from a platform default if it ever needs to.
        targetDurationOverride: combinedSettings.targetDurationOverride,
        onProgress: (progress) => {
          logger.info(`Video ${videoId} progress: ${progress.percent}%`)
          // Could update progress in database or send websocket update
        }
      } as VideoProcessingOptions
    )
    
    // 6b. Intro: when a full-length intro clip was supplied, normalize it to
    // this render's resolution/fps and concat it in front. GUARDED by
    // settings.intro.url — renders without an intro skip this entirely and are
    // byte-identical. Best-effort: a failure falls back to the intro-less slideshow.
    let finalPath = outputPath
    // Resolve the intro into an ordered segment list. New shape:
    // settings.intro.segments[] (video clips + timed images). Legacy single-clip
    // (intro.url / introVideo string) is wrapped as one video segment.
    const introCfg = combinedSettings?.intro
    let introSegments: IntroSeg[] = []
    if (introCfg && Array.isArray(introCfg.segments) && introCfg.segments.length > 0) {
      introSegments = introCfg.segments
        .filter((s: any) => s && typeof s.url === 'string' && s.url)
        .map((s: any) => ({
          kind: s.kind === 'image' ? 'image' : 'video',
          url: s.url as string,
          durationSeconds: typeof s.durationSeconds === 'number' ? s.durationSeconds : undefined,
          keepAudio: typeof s.keepAudio === 'boolean' ? s.keepAudio : undefined,
        }))
    } else {
      const legacyUrl: string | undefined =
        introCfg && typeof introCfg.url === 'string' && introCfg.url
          ? introCfg.url
          : typeof combinedSettings?.introVideo === 'string' && combinedSettings.introVideo
            ? combinedSettings.introVideo
            : undefined
      if (legacyUrl) {
        introSegments = [{
          kind: 'video',
          url: legacyUrl,
          durationSeconds: typeof introCfg?.durationSeconds === 'number' ? introCfg.durationSeconds : undefined,
          keepAudio: typeof introCfg?.keepAudio === 'boolean' ? introCfg.keepAudio : undefined,
        }]
      }
    }
    if (introSegments.length > 0) {
      logger.info('Prepending intro', { videoId, segments: introSegments.length })
      const introWorkDir = path.join(config.TEMP_DIR || './temp', `intro-${video.id}`)
      finalPath = await prependIntroSegments(outputPath, introSegments, config.FFMPEG_PATH || 'ffmpeg', introWorkDir)
    }

    // 6c. Music-over-intro final pass: mix the deferred background music over the
    // FULL [intro+body] timeline, looped to fill and sidechain-ducked under the
    // voiceover/clip audio already on the track. Video is stream-copied (already
    // final) — audio-only re-encode. Best-effort: on failure keep the music-less
    // finalPath rather than fail the render.
    if (deferredMusic && finalPath && introSegments.length > 0) {
      try {
        const mixWorkDir = path.join(config.TEMP_DIR || './temp', `musicmix-${video.id}`)
        const mixedPath = await mixMusicOverFull(
          finalPath,
          deferredMusic,
          config.FFMPEG_PATH || 'ffmpeg',
          mixWorkDir,
        )
        if (mixedPath !== finalPath) {
          if (finalPath !== outputPath) await fs.unlink(finalPath).catch(() => {})
          finalPath = mixedPath
        }
      } catch (e) {
        // HARD FAIL. The user selected background music; we never silently ship
        // intro+body without it. Surface the error so the render is marked
        // failed rather than producing a music-less video.
        const msg = e instanceof Error ? e.message : String(e)
        logger.error('Music-over-intro final pass failed — failing render (no silent drop)', { videoId, error: msg })
        throw new Error(`Selected background music could not be mixed: ${msg}`)
      }
    }

    // 7. Get video metadata
    const stats = await fs.stat(finalPath)
    const metadata = await getVideoMetadata(finalPath)

    // 8. Upload to R2/S3 (grouped by generation, matching the API/render-worker convention)
    const s3Key = `videos/${video.generationId}/${video.id}.mp4`
    const videoUrl = await uploadToR2(finalPath, s3Key, 'video/mp4')

    // 9. Generate thumbnail
    const thumbnailPath = await generateThumbnail(finalPath)
    const thumbnailS3Key = `videos/${video.generationId}/${video.id}_thumb.jpg`
    const thumbnailUrl = await uploadToR2(thumbnailPath, thumbnailS3Key, 'image/jpeg')
    
    // 10. Update database with results. Clear `error` because a retried
    // job leaves the last "at capacity" string from a prior failed attempt.
    await prisma.video.update({
      where: { id: video.id },
      data: {
        status: 'completed',
        s3Key,
        thumbnailS3Key,
        duration: metadata.duration,
        fileSize: BigInt(stats.size),
        metadata: {
          resolution: metadata.resolution,
          codec: metadata.codec,
          bitrate: metadata.bitrate,
          fps: metadata.fps
        },
        processingTime: Math.floor((Date.now() - startTime) / 1000),
        completedAt: new Date(),
        error: null
      }
    })
    
    // 11. Cleanup temp files
    await fs.unlink(finalPath).catch(() => {})
    if (finalPath !== outputPath) await fs.unlink(outputPath).catch(() => {})
    await fs.unlink(thumbnailPath).catch(() => {})
    
    logger.info(`Video generation completed for video ${videoId}`, {
      duration: metadata.duration,
      fileSize: stats.size,
      processingTime: Date.now() - startTime
    })
    
    return {
      success: true,
      videoUrl,
      thumbnailUrl,
      metadata
    }
    
  } catch (error) {
    logger.error(`Video generation failed for video ${videoId}:`, error)
    
    // Update job as failed
    await prisma.video.update({
      where: { id: videoId },
      data: {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date()
      }
    })
    
    throw error
  } finally {
    if (watchdog) clearTimeout(watchdog)
  }
}

async function prepareAssets(media: any[]): Promise<any> {
  // Download media from S3 to temp directory
  // Return paths for video generator
  const assets: any = {
    images: [],
    logo: null,
    backgroundImage: null,
    backgroundVideo: null,
    reviewImage: null,
    // Parallel to `images` — each entry is the originating VideoMedia id.
    // The video.ts core then applies per-frame overrides from
    // options.settings.frameOverridesByMediaId using this map.
    imageMediaIds: [],
    // Non-fatal degradations during asset prep (e.g. a media file failed to
    // download and was skipped). Surfaced to the user via video.metadata.warnings
    // instead of silently shipping a video with garbage frames.
    warnings: [] as string[]
  }
  
  // Create temp directory for assets
  const tempAssetsDir = path.join(config.TEMP_DIR || './temp', 'assets', Date.now().toString())
  await fs.mkdir(tempAssetsDir, { recursive: true })
  
  for (const item of media) {
    const tempPath = path.join(tempAssetsDir, item.filename)
    
    // Handle different storage scenarios
    if (item.s3Key && item.s3Key.startsWith('http')) {
      // If s3Key is a full URL, download it
      logger.info(`Downloading from URL: ${item.s3Key}`)
      try {
        execSyncBounded(
          `curl -L "${item.s3Key}" -o "${tempPath}" --fail --silent --show-error --connect-timeout 15 --max-time 180 --retry 2 --retry-delay 2`
        )
      } catch (error) {
        // Skip + warn — never push a missing file into the render.
        logger.error('Failed to download image, skipping:', error)
        assets.warnings.push(`A media file could not be downloaded and was left out of the video (${item.filename}).`)
        continue
      }
    } else if (item.s3Key) {
      // Download from R2 using the R2 client
      logger.info(`Downloading from R2: ${item.s3Key}`)
      try {
        const { downloadFromR2 } = await import('../storage/r2-client.js')
        await downloadFromR2(item.s3Key, tempPath)
      } catch (error) {
        // Do NOT substitute a random colored placeholder — a "successful" video
        // of random-color frames is worse than a visibly-missing asset. Skip the
        // item and record a warning so the degradation is surfaced, not hidden.
        logger.error('Failed to download from R2, skipping:', error)
        assets.warnings.push(`A media file could not be downloaded and was left out of the video (${item.filename}).`)
        continue
      }
    } else {
      // No storage key at all — skip + warn rather than inventing a placeholder.
      logger.warn(`Media item has no storage key, skipping: ${item.filename}`)
      assets.warnings.push(`A media item had no file and was left out of the video (${item.filename}).`)
      continue
    }
    
    if (item.mimeType.startsWith('image/')) {
      if (item.filename.toLowerCase().includes('logo')) {
        assets.logo = tempPath
      } else if (item.metadata?.type === 'review') {
        assets.reviewImage = tempPath
      } else if (item.metadata?.type === 'background') {
        assets.backgroundImage = tempPath
      } else {
        // Regular project images — remember the VideoMedia id alongside
        // the local path so the renderer can apply per-frame overrides.
        assets.images.push(tempPath)
        assets.imageMediaIds.push(item.id)
      }
    } else if (item.mimeType.startsWith('video/')) {
      assets.backgroundVideo = tempPath
    }
  }
  
  // Ensure we have at least some images
  if (assets.images.length === 0 && !assets.backgroundVideo) {
    throw new Error('No images or video found for project')
  }
  
  return assets
}

async function getVideoMetadata(videoPath: string): Promise<any> {
  try {
    const ffprobeCmd = `ffprobe -v quiet -print_format json -show_streams -show_format "${videoPath}"`
    const output = execSyncBounded(ffprobeCmd).toString()
    const data = JSON.parse(output)
    
    const videoStream = data.streams.find((s: any) => s.codec_type === 'video')
    
    return {
      duration: parseFloat(data.format.duration),
      resolution: `${videoStream.width}x${videoStream.height}`,
      codec: videoStream.codec_name,
      bitrate: parseInt(data.format.bit_rate),
      fps: eval(videoStream.r_frame_rate) // Evaluates fraction like "30/1"
    }
  } catch (error) {
    logger.error('Failed to get video metadata:', error)
    return {
      duration: 0,
      resolution: 'unknown',
      codec: 'unknown',
      bitrate: 0,
      fps: 0
    }
  }
}

/**
 * Final-pass audio mix: lay a looped background-music bed over the ENTIRE
 * finished video (intro + body) and duck it under whatever speech/clip audio
 * is already on the track.
 *
 * Why a separate pass (not baked into the body): FFmpeg is linear. The body is
 * rendered first, then the intro is concatenated in FRONT of it. Music baked
 * into the body inherits the body's start and plays BEHIND the intro. Mixing
 * here — after the concat, over the full timeline — is the only place the bed
 * can span the intro. (Remotion gets this free: its music <Audio> is mounted at
 * composition level, above every slot.)
 *
 * Ducking via sidechaincompress, NOT amix auto-normalize: amix with
 * `duration=longest` renormalizes volume when an input drops out (the ~2s
 * `dropout_transition`), making the bed audibly SWELL the moment the voiceover
 * ends. Instead we split the existing track, key a sidechain compressor on the
 * speech, and amix with `normalize=0` so levels are deterministic and the bed
 * never pumps.
 *
 * The concat track carries audio when the body had a voiceover (silent intro
 * region + VO body region). When there's no speech anywhere the track may be
 * absent, so we probe for it: with speech we duck; without, the looped music IS
 * the audio. Video is stream-copied (`-c:v copy`) — audio-only re-encode.
 */
async function mixMusicOverFull(
  videoPath: string,
  musicPath: string,
  ffmpegPath: string,
  workDir: string,
): Promise<string> {
  await fs.mkdir(workDir, { recursive: true })
  const total = (await getVideoMetadata(videoPath)).duration || 0
  if (!(total > 0)) {
    logger.warn('mixMusicOverFull: could not read total duration — skipping music bed')
    return videoPath
  }
  const fadeStart = Math.max(0, total - 1.5)
  const outPath = path.join(workDir, 'with_music.mp4')

  const hasSpeech = (() => {
    try {
      return (
        execSyncBounded(
          `ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "${videoPath}"`,
        )
          .toString()
          .trim().length > 0
      )
    } catch {
      return false
    }
  })()

  // [1:a] = music, looped (-stream_loop -1) to outlast the video; base level
  // 0.15 with a 1s fade-in and a 1.5s tail fade-out.
  let filter: string
  if (hasSpeech) {
    // Duck the bed under the existing speech track. asplit so [0:a] both keys
    // the sidechain and stays in the final mix. normalize=0 → no amix pumping.
    //
    // CRITICAL length handling: the body's audio track ([0:a]) is only as long
    // as the voiceover (~speech length), but the body VIDEO is stretched to the
    // platform's target duration — so [0:a] can be far shorter than `total`
    // (e.g. 19s of VO under a 63s video). Two traps that truncate the mix:
    //   1) sidechaincompress ends when its sidechain KEY input ends, so a short
    //      key would cut the ducked bed off early.
    //   2) amix=duration=first ends the output when the first input ends.
    // We pad BOTH the mix copy (a_main) and the sidechain key (a_key) to `total`
    // with apad (silence after the speech) so the compressor runs the full
    // length and amix spans the whole video. After the speech ends the padded
    // key is silent → no ducking → the bed returns to full volume. `-t total`
    // remains a final safety bound.
    filter = [
      `[0:a]asplit=2[m0][k0]`,
      `[m0]apad=whole_dur=${total.toFixed(3)}[a_main]`,
      `[k0]apad=whole_dur=${total.toFixed(3)}[a_key]`,
      `[1:a]volume=0.15,afade=t=in:st=0:d=1,afade=t=out:st=${fadeStart.toFixed(3)}:d=1.5[bed]`,
      `[bed][a_key]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[bed_ducked]`,
      `[a_main][bed_ducked]amix=inputs=2:duration=first:normalize=0[aout]`,
    ].join(';')
  } else {
    // No speech — the looped, faded music IS the audio track.
    filter = `[1:a]volume=0.15,afade=t=in:st=0:d=1,afade=t=out:st=${fadeStart.toFixed(3)}:d=1.5[aout]`
  }

  const cmd =
    `${ffmpegPath} -i "${videoPath}" -stream_loop -1 -i "${musicPath}" ` +
    `-filter_complex "${filter}" -map 0:v -map "[aout]" ` +
    `-c:v copy -c:a aac -b:a 192k -ar 48000 -ac 2 -movflags +faststart -t ${total.toFixed(3)} -y "${outPath}"`

  logger.info('mixMusicOverFull: laying ducked music bed over full timeline', { total, hasSpeech })
  execSyncBounded(cmd, { stdio: ['ignore', 'ignore', 'pipe'] })
  await fs.stat(outPath)
  return outPath
}

/**
 * Prepend a FULL-LENGTH client intro clip to the rendered slideshow.
 *
 * The clip can be any resolution / fps / codec and may or may not carry audio,
 * so we NORMALIZE it to the slideshow's exact W×H + fps (letterbox-padded to
 * preserve aspect), then concat [intro, slideshow]. Audio is matched to the
 * slideshow: if the slideshow has sound the intro keeps its own audio (or a
 * silent track so the streams line up); if the slideshow is silent the intro is
 * muxed silent too — otherwise the concat filter's stream layouts wouldn't match.
 *
 * Best-effort: returns the ORIGINAL slideshow path on any failure. An intro
 * glitch must never fail the whole render. Only invoked when settings.intro.url
 * is present, so non-intro renders never touch this code.
 */
interface IntroSeg {
  kind: 'video' | 'image'
  url: string
  durationSeconds?: number
  keepAudio?: boolean
}

/**
 * Prepend an ordered list of intro segments (video clips + timed images) to the
 * slideshow. Each segment is normalized to the slideshow's exact W×H/fps and a
 * consistent audio layout (silent stereo for images / audioless clips when the
 * slideshow has audio), then ALL segments + the slideshow are concatenated.
 *
 * Prefers the concat demuxer with stream-copy (every segment was pre-normalized
 * to the slideshow's layout, so the GALLERY stays byte-for-byte untouched and
 * each segment is encoded only once), falling back to a re-encode concat filter
 * if the joined duration doesn't line up. Best-effort: a single bad segment is
 * skipped; total failure falls back to the intro-less slideshow.
 */
async function prependIntroSegments(
  slideshowPath: string,
  segments: IntroSeg[],
  ffmpegPath: string,
  workDir: string,
): Promise<string> {
  const hasAudioStream = (p: string): boolean => {
    try {
      return execSyncBounded(
        `ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "${p}"`,
      ).toString().trim().length > 0
    } catch {
      return false
    }
  }

  try {
    if (segments.length === 0) return slideshowPath
    await fs.mkdir(workDir, { recursive: true })

    // Match the slideshow's geometry — the normalization target for every segment.
    const meta = await getVideoMetadata(slideshowPath)
    const [w, h] = String(meta.resolution).split('x').map((n) => parseInt(n, 10))
    const fps = Math.round(Number(meta.fps)) || 30
    if (!w || !h) {
      logger.warn('Could not read slideshow dimensions — skipping intro', { resolution: meta.resolution })
      return slideshowPath
    }
    const slideshowHasAudio = hasAudioStream(slideshowPath)
    const vf = `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=${fps},format=yuv420p`
    const vEnc = '-c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p'

    // Normalize each segment to a W×H/fps clip with a consistent audio layout.
    const normPaths: string[] = []
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      if (!seg?.url) continue
      const raw = path.join(workDir, `seg_raw_${i}`)
      try {
        execSyncBounded(`curl -L "${seg.url}" -o "${raw}" --fail --silent --show-error`, {
          stdio: ['ignore', 'ignore', 'pipe'],
        })
        if ((await fs.stat(raw)).size < 100) {
          logger.warn('Intro segment too small/empty — skipping', { i, url: seg.url })
          continue
        }
      } catch {
        logger.warn('Intro segment download failed — skipping', { i, url: seg.url })
        continue
      }

      const norm = path.join(workDir, `seg_norm_${i}.mp4`)
      try {
        if (seg.kind === 'image') {
          // Still image → a clip of `durationSeconds` (default 3s).
          const dur = Number(seg.durationSeconds) > 0 ? Number(seg.durationSeconds) : 3
          if (slideshowHasAudio) {
            execSyncBounded(
              `${ffmpegPath} -loop 1 -i "${raw}" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000 -map 0:v:0 -map 1:a:0 -t ${dur} -vf "${vf}" ${vEnc} -c:a aac -ar 48000 -ac 2 -y "${norm}"`,
              { stdio: ['ignore', 'ignore', 'pipe'] },
            )
          } else {
            execSyncBounded(
              `${ffmpegPath} -loop 1 -i "${raw}" -t ${dur} -vf "${vf}" ${vEnc} -an -y "${norm}"`,
              { stdio: ['ignore', 'ignore', 'pipe'] },
            )
          }
        } else {
          // Video clip — optional trim to durationSeconds, else its natural length.
          const trim = Number(seg.durationSeconds) > 0 ? `-t ${Number(seg.durationSeconds)}` : ''
          const segHasAudio = hasAudioStream(raw)
          const keep = seg.keepAudio !== false
          if (slideshowHasAudio && segHasAudio && keep) {
            execSyncBounded(
              `${ffmpegPath} -i "${raw}" -map 0:v:0 -map 0:a:0 -vf "${vf}" ${vEnc} -c:a aac -ar 48000 -ac 2 ${trim} -y "${norm}"`,
              { stdio: ['ignore', 'ignore', 'pipe'] },
            )
          } else if (slideshowHasAudio) {
            execSyncBounded(
              `${ffmpegPath} -i "${raw}" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000 -map 0:v:0 -map 1:a:0 -vf "${vf}" ${vEnc} -c:a aac -ar 48000 -ac 2 -shortest ${trim} -y "${norm}"`,
              { stdio: ['ignore', 'ignore', 'pipe'] },
            )
          } else {
            execSyncBounded(
              `${ffmpegPath} -i "${raw}" -map 0:v:0 -an -vf "${vf}" ${vEnc} ${trim} -y "${norm}"`,
              { stdio: ['ignore', 'ignore', 'pipe'] },
            )
          }
        }
        await fs.stat(norm)
        normPaths.push(norm)
      } catch (e) {
        logger.warn('Intro segment normalize failed — skipping', {
          i,
          kind: seg.kind,
          error: e instanceof Error ? e.message : e,
        })
      }
    }

    if (normPaths.length === 0) {
      logger.warn('No intro segments survived normalization — rendering without intro')
      return slideshowPath
    }

    // Concat [seg_0…seg_N, slideshow]. Prefer stream-copy (every segment was
    // normalized to the slideshow's layout → gallery untouched), verify total
    // duration ≈ Σ(segments) + slideshow, else re-encode concat filter (n=N+1).
    const finalPath = path.join(workDir, 'with_intro.mp4')
    let introDur = 0
    for (const p of normPaths) introDur += (await getVideoMetadata(p)).duration || 0
    const slideDur = (await getVideoMetadata(slideshowPath)).duration || 0
    const expectedDur = introDur + slideDur
    let usedCopy = false
    if (expectedDur > 0) {
      try {
        const listPath = path.join(workDir, 'concat_list.txt')
        const lines = [...normPaths.map((p) => `file '${p}'`), `file '${slideshowPath}'`].join('\n') + '\n'
        await fs.writeFile(listPath, lines)
        execSyncBounded(
          `${ffmpegPath} -f concat -safe 0 -i "${listPath}" -c copy -movflags +faststart -y "${finalPath}"`,
          { stdio: ['ignore', 'ignore', 'pipe'] },
        )
        const gotDur = (await getVideoMetadata(finalPath)).duration || 0
        // Per-segment boundary slack scales with segment count.
        usedCopy = Math.abs(gotDur - expectedDur) <= 0.7 + normPaths.length * 0.1
      } catch {
        usedCopy = false
      }
    }
    if (!usedCopy) {
      const inputs = [...normPaths, slideshowPath]
      const inFlags = inputs.map((p) => `-i "${p}"`).join(' ')
      const n = inputs.length
      if (slideshowHasAudio) {
        const streams = inputs.map((_, i) => `[${i}:v][${i}:a]`).join('')
        execSyncBounded(
          `${ffmpegPath} ${inFlags} -filter_complex "${streams}concat=n=${n}:v=1:a=1[v][a]" -map "[v]" -map "[a]" ${vEnc} -c:a aac -ar 48000 -ac 2 -movflags +faststart -y "${finalPath}"`,
          { stdio: ['ignore', 'ignore', 'pipe'] },
        )
      } else {
        const streams = inputs.map((_, i) => `[${i}:v]`).join('')
        execSyncBounded(
          `${ffmpegPath} ${inFlags} -filter_complex "${streams}concat=n=${n}:v=1:a=0[v]" -map "[v]" ${vEnc} -movflags +faststart -y "${finalPath}"`,
          { stdio: ['ignore', 'ignore', 'pipe'] },
        )
      }
    }
    await fs.stat(finalPath)
    logger.info('Intro segments prepended', {
      count: normPaths.length,
      method: usedCopy ? 'stream-copy (gallery untouched)' : 're-encode (fallback)',
      w,
      h,
      fps,
      slideshowHasAudio,
    })
    return finalPath
  } catch (error) {
    logger.error('Failed to prepend intro segments — rendering without it', {
      error: error instanceof Error ? error.message : error,
    })
    return slideshowPath
  }
}

async function generateThumbnail(videoPath: string, _generator?: any): Promise<string> {
  const thumbnailPath = videoPath.replace('.mp4', '_thumb.jpg')

  try {
    // Extract frame at 1 second
    const ffmpegCmd = `ffmpeg -i "${videoPath}" -ss 00:00:01 -vframes 1 -f image2 "${thumbnailPath}" -y`
    execSyncBounded(ffmpegCmd)

    return thumbnailPath
  } catch (error) {
    logger.error('Failed to generate thumbnail:', error)
    // Return a default thumbnail path or generate a placeholder
    throw error
  }
}

/**
 * Resolve an audio asset (background music or voiceover) referenced by URL
 * or R2 s3Key into a local file path. Returns undefined when no usable
 * reference is provided (e.g. UI checked the "skip" / "no music" option) so
 * the caller can pass it straight to FFmpegRenderer, which treats undefined
 * as "no track of this kind".
 *
 * Accepted input shapes (per current frontend payload):
 *   { url: "https://..." }       — download via HTTP
 *   { s3Key: "music/foo.mp3" }   — download from R2
 *   { audioUrl: "https://..." }  — voiceover-shaped variant
 *   { source: 'none' }           — explicit skip; returns undefined
 *
 * The TTS-from-script path is NOT handled here — the API layer is expected
 * to pre-synthesize and set `audioUrl` before posting to `/process`. We
 * don't want this binary depending on the API's TTS providers, and we don't
 * want every render replica racing to hit OpenAI/ElevenLabs for the same
 * script. See videoQueueService.ts for the synthesis path.
 */
async function resolveAudioAsset(
  spec: any,
  workDir: string,
  label: 'music' | 'voiceover',
): Promise<string | undefined> {
  if (!spec || typeof spec !== 'object') return undefined
  if (spec.source === 'none' || spec.source === 'skip') return undefined

  const url: string | undefined = typeof spec.url === 'string' && spec.url
    ? spec.url
    : (typeof spec.audioUrl === 'string' && spec.audioUrl ? spec.audioUrl : undefined)
  const s3Key: string | undefined = typeof spec.s3Key === 'string' && spec.s3Key
    ? spec.s3Key
    : undefined

  if (!url && !s3Key) return undefined

  const ext = label === 'voiceover' ? 'mp3' : 'mp3'
  const localPath = path.join(workDir, `${label}.${ext}`)

  // Presigned URLs stored in settings expire (~1h) and 403 on delayed or
  // retried renders. Whenever the asset lives in our own R2 bucket, download it
  // with the authenticated client (downloadFromR2 extracts the key from the URL
  // path and ignores the stale signature). Only truly-external URLs are curled.
  const isOurR2Url = !!url && /\.r2\.cloudflarestorage\.com/i.test(url)
  const r2Ref: string | undefined = s3Key || (isOurR2Url ? url : undefined)

  try {
    if (r2Ref) {
      logger.info(`Downloading ${label} from R2 (authenticated)`, { ref: r2Ref.slice(0, 80) })
      const { downloadFromR2 } = await import('../storage/r2-client.js')
      await downloadFromR2(r2Ref, localPath)
    } else if (url) {
      logger.info(`Downloading ${label} from external URL`, { url })
      execSyncBounded(`curl -L "${url}" -o "${localPath}" --fail --silent --show-error --connect-timeout 15 --max-time 180 --retry 2 --retry-delay 2`, {
        stdio: ['ignore', 'ignore', 'pipe'],
      })
    }
    const stats = await fs.stat(localPath)
    if (stats.size < 100) {
      // A selection that downloads to an empty/broken file is a hard failure —
      // we never silently ship without the audio the user selected.
      throw new Error(`${label} asset downloaded but is empty/too small (${stats.size} bytes)`)
    }
    return localPath
  } catch (error) {
    // HARD FAIL. The user explicitly selected this audio (a url/s3Key was
    // present), so the render MUST include it or fail loudly. Silently
    // shipping a video without the chosen voice/music is the regression we are
    // eliminating. The top-level processor catch marks the video failed with
    // this message.
    const msg = error instanceof Error ? error.message : String(error)
    logger.error(`Failed to resolve ${label} asset — failing render (no silent drop)`, { error: msg, spec })
    throw new Error(`Selected ${label} could not be loaded: ${msg}`)
  }
}