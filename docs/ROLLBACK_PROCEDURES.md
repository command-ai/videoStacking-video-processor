# Rollback Procedures
## Video Processor - Railway Deployment

### Version: 1.0.0
### Last Updated: 2025-11-08

---

## Quick Reference

### Emergency Rollback (30 seconds)
```bash
railway rollback
```

### Verify Rollback
```bash
curl -f https://your-service.railway.app/health
railway logs --tail 50
```

---

## Table of Contents
1. [When to Rollback](#when-to-rollback)
2. [Automated Rollback](#automated-rollback)
3. [Manual Rollback](#manual-rollback)
4. [Verification](#verification)
5. [Communication](#communication)
6. [Post-Rollback](#post-rollback)

---

## When to Rollback

### Immediate Rollback Required
Execute rollback immediately if any of these occur:

**Critical Service Failures:**
- ❌ Health check fails for 5+ consecutive minutes
- ❌ Service completely unresponsive
- ❌ Error rate > 50% for 2+ minutes
- ❌ Database corruption detected
- ❌ Security vulnerability exploited

**Data Integrity Issues:**
- ❌ Videos being corrupted during processing
- ❌ Database writes failing
- ❌ File uploads failing consistently

**Performance Degradation:**
- ❌ Response time > 30 seconds consistently
- ❌ Memory leak causing crashes
- ❌ CPU at 100% without processing

### Consider Rollback
Evaluate situation before rolling back:

**Moderate Issues:**
- ⚠️ Error rate 10-50% for 5+ minutes
- ⚠️ Slow response times (5-30 seconds)
- ⚠️ Intermittent failures
- ⚠️ Non-critical feature broken

**Minor Issues:**
- ℹ️ Error rate 1-10%
- ℹ️ Slight performance degradation
- ℹ️ UI issues (if applicable)
- ℹ️ Non-critical warnings in logs

---

## Automated Rollback

### GitHub Actions Rollback

The CI/CD pipeline automatically rolls back on:
- Test failures after deployment
- Health check failures
- Smoke test failures

**Process:**
1. Deployment completes
2. Tests run automatically
3. If tests fail → automatic rollback
4. Team notified via GitHub

**Configuration:**
```yaml
# In .github/workflows/deploy-video-processor.yml
- name: Rollback on failure
  if: failure()
  env:
    RAILWAY_TOKEN: ${{ secrets.RAILWAY_PRODUCTION_TOKEN }}
  run: |
    railway rollback
```

---

### Railway Auto-Rollback

Railway automatically handles:
- Container start failures (after 3 retries)
- Health check failures (after 3 consecutive fails)
- Build failures

**Configuration:**
```json
// railway.json
{
  "deploy": {
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3,
    "healthcheckPath": "/health",
    "healthcheckTimeout": 30
  }
}
```

---

## Manual Rollback

### Step 1: Identify the Issue

**Check Service Status:**
```bash
# Get current status
railway status

# Check recent logs
railway logs --tail 100

# Test health endpoint
curl -f https://your-service.railway.app/health
```

**Review Metrics:**
- Error rate in last 10 minutes
- Response time trends
- Active incidents
- User reports

**Document the Issue:**
```markdown
## Incident Report

**Time**: 2025-11-08 12:00 UTC
**Severity**: Critical/High/Medium/Low
**Issue**: Brief description
**Impact**: User-facing impact
**Detected by**: Monitoring/User report/Manual check
```

---

### Step 2: Notify Team

**Immediate Notification:**
```markdown
🚨 ROLLBACK IN PROGRESS

Service: video-processor
Environment: production
Reason: [Brief description]
Initiated by: [Your name]
Time: [Timestamp]

Status: In progress...
```

**Channels to Notify:**
- #incidents Slack channel
- On-call engineer
- Tech lead
- DevOps team

---

### Step 3: Find Last Good Deployment

**List Recent Deployments:**
```bash
# View deployment history
railway deployments list

# Get detailed info
railway deployments list --json | jq '.'
```

**Sample Output:**
```
ID                    STATUS    CREATED              MESSAGE
dep-abc123           SUCCESS   2025-11-08 11:45    Latest deployment
dep-def456           SUCCESS   2025-11-08 09:30    Previous stable
dep-ghi789           FAILED    2025-11-08 08:15    Failed build
```

**Identify Target:**
- Look for last deployment with SUCCESS status
- Check deployment timestamp
- Verify it was stable (check logs/metrics)
- Note deployment ID

---

### Step 4: Execute Rollback

**Method 1: Rollback to Previous**
```bash
# Rollback to immediately previous deployment
railway rollback

# Confirm rollback
# Press 'y' when prompted
```

**Method 2: Rollback to Specific Deployment**
```bash
# Rollback to specific deployment ID
railway rollback --deployment dep-def456

# Confirm rollback
```

**Monitor Rollback:**
```bash
# Watch deployment progress
railway status --watch

# Stream logs
railway logs --follow
```

**Expected Timeline:**
- Rollback initiated: 0s
- Container stopping: 5-10s
- New container starting: 20-40s
- Health check passing: 30-60s
- Total time: ~60-90s

---

### Step 5: Verify Rollback Success

**Run Verification Checklist:**

**1. Health Check:**
```bash
# Test health endpoint
curl -f https://your-service.railway.app/health

# Expected: 200 OK with healthy status
```

**2. Functionality Test:**
```bash
# Run deployment test suite
cd video-processor
./scripts/test-deployment.sh https://your-service.railway.app
```

**3. Check Logs:**
```bash
# Review recent logs for errors
railway logs --tail 100

# No startup errors expected
```

**4. Monitor Metrics:**
- Error rate back to normal (< 1%)
- Response time acceptable (< 5s)
- No active incidents
- Health checks passing

**5. Test Core Features:**
```bash
# Test video processing
curl -X POST https://your-service.railway.app/enhance \
  -H "Content-Type: application/json" \
  -d '{
    "videoId": "test-rollback-001",
    "platform": "youtube",
    "mediaIds": ["test-img"],
    "enhancements": {},
    "settings": {},
    "organizationId": "test-org"
  }'

# Verify response is successful
```

---

### Step 6: Update Team

**Success Notification:**
```markdown
✅ ROLLBACK COMPLETE

Service: video-processor
Environment: production
Previous version: dep-abc123
Rolled back to: dep-def456
Completed at: [Timestamp]
Duration: [X minutes]

Status: ✅ Service restored and healthy

Next steps:
- Monitor for 1 hour
- Root cause analysis scheduled
- Post-mortem on [Date]
```

**Failure Notification:**
```markdown
❌ ROLLBACK ISSUES

Service: video-processor
Environment: production
Status: Rollback completed but issues remain

Issues:
- [List any remaining issues]

Actions:
- [Next steps]
- Escalated to: [Person/Team]
```

---

## Verification Checklist

Use this checklist after every rollback:

### Service Health
- [ ] Health endpoint returns 200 OK
- [ ] Health status is "healthy"
- [ ] No errors in response

### Functionality
- [ ] `/process` endpoint accessible
- [ ] `/enhance` endpoint accessible
- [ ] Video processing works
- [ ] File uploads work
- [ ] Database queries successful

### Performance
- [ ] Response time < 5 seconds
- [ ] Error rate < 1%
- [ ] CPU usage normal (< 50%)
- [ ] Memory usage stable (< 80%)
- [ ] No memory leaks detected

### Logs
- [ ] No error messages in last 50 lines
- [ ] No warning messages about critical issues
- [ ] Application started successfully
- [ ] Database connected
- [ ] FFmpeg available

### Dependencies
- [ ] Database accessible
- [ ] R2 storage accessible
- [ ] External APIs responding

### Monitoring
- [ ] All monitoring alerts cleared
- [ ] Metrics returning to normal
- [ ] No new incidents created

### User Impact
- [ ] Users can access service
- [ ] No user-facing errors
- [ ] Feature functionality restored

---

## Communication Templates

### Incident Start
```markdown
Subject: [INCIDENT] Video Processor Deployment Issue

Priority: High
Service: video-processor
Environment: production
Status: Investigating

Timeline:
- 12:00 UTC - Issue detected
- 12:02 UTC - Rollback initiated

Impact:
- Video processing may fail
- Users may see errors

Actions:
- Rollback in progress
- ETA: 5 minutes

Team:
- Incident Commander: [Name]
- On-call: [Name]
```

### Rollback Complete
```markdown
Subject: [RESOLVED] Video Processor Rollback Complete

Priority: High
Service: video-processor
Environment: production
Status: Resolved

Timeline:
- 12:00 UTC - Issue detected
- 12:02 UTC - Rollback initiated
- 12:05 UTC - Rollback completed
- 12:10 UTC - Verified healthy

Resolution:
- Rolled back to version dep-def456
- Service fully restored
- All tests passing

Next Steps:
- Monitoring for 1 hour
- Root cause analysis tomorrow
- Post-mortem scheduled

Thank you for your patience.
```

### Stakeholder Update
```markdown
Subject: Service Update - Video Processor

Hi team,

We experienced a brief issue with the video processor service today at 12:00 UTC.

What happened:
- New deployment caused video processing errors
- Issue detected within 2 minutes
- Rolled back to previous stable version
- Service restored by 12:05 UTC

Impact:
- Service unavailable for ~5 minutes
- Approximately X video processing jobs affected
- No data loss

Resolution:
- Service is now stable and fully operational
- We're conducting a thorough analysis
- Improvements to our deployment process planned

Questions? Contact [Name]
```

---

## Post-Rollback Actions

### Immediate (Within 1 hour)

**1. Monitor Service:**
```bash
# Continuous monitoring
watch -n 30 'curl -s https://your-service.railway.app/health | jq .'

# Check metrics dashboard
# Watch error rates, response times
```

**2. Document Incident:**
```markdown
## Incident Log: [Date]

**Incident ID**: INC-2025-XXX
**Service**: video-processor
**Environment**: production
**Severity**: Critical/High/Medium/Low

**Timeline**:
- [Time] - Issue first detected
- [Time] - Team notified
- [Time] - Rollback initiated
- [Time] - Rollback completed
- [Time] - Service verified

**Root Cause**: [Brief description]

**Impact**:
- Downtime: X minutes
- Affected users: ~X
- Failed requests: X

**Resolution**: Rolled back to deployment [ID]

**Prevention**: [Next steps to prevent recurrence]
```

**3. Notify Stakeholders:**
- Update status page
- Send email summary
- Post in team channels

---

### Short-term (Within 24 hours)

**1. Root Cause Analysis:**
```markdown
## Root Cause Analysis

**What happened**:
[Detailed description]

**Why it happened**:
[Technical explanation]

**Why it wasn't caught**:
[Test/process gap]

**Impact**:
[Quantified impact]

**Timeline**:
[Detailed timeline]
```

**2. Fix Identification:**
- Identify the problematic code
- Determine the fix needed
- Estimate fix complexity
- Plan fix implementation

**3. Test Improvements:**
- Add test case for the issue
- Improve test coverage
- Update validation checks
- Enhance monitoring

---

### Medium-term (Within 1 week)

**1. Post-Mortem:**
```markdown
## Post-Mortem: [Incident]

**Date**: [Date]
**Participants**: [Names]

**Summary**:
[What happened and why]

**What went well**:
- Quick detection
- Fast rollback
- Good communication

**What went wrong**:
- Issue not caught in testing
- Deployment process allowed it

**Action Items**:
- [ ] Add test for [issue]
- [ ] Update deployment checklist
- [ ] Improve monitoring
- [ ] Document learnings

**Owner**: [Name]
**Due**: [Date]
```

**2. Process Improvements:**
- Update deployment procedures
- Enhance testing strategy
- Improve monitoring
- Update runbooks

**3. Team Training:**
- Share learnings
- Update documentation
- Practice rollback procedures
- Review incident response

---

### Long-term (Within 1 month)

**1. Preventive Measures:**
- Implement identified fixes
- Deploy improvements
- Verify effectiveness
- Monitor for recurrence

**2. Documentation Updates:**
- Update runbooks
- Improve rollback procedures
- Document edge cases
- Share knowledge

**3. Process Review:**
- Review deployment process
- Assess testing coverage
- Evaluate monitoring
- Plan improvements

---

## Rollback Scenarios

### Scenario 1: Database Migration Issue

**Problem**: New deployment includes incompatible database migration

**Rollback Process**:
1. Rollback application first
2. Rollback database migration separately
3. Verify data integrity
4. Test application with old schema

**Commands**:
```bash
# Rollback application
railway rollback

# Rollback database (in separate process)
npx prisma migrate resolve --rolled-back [migration_name]

# Verify
railway logs --tail 100
```

---

### Scenario 2: Environment Variable Issue

**Problem**: Missing or invalid environment variable in new deployment

**Quick Fix** (if faster than rollback):
```bash
# Set correct variable
railway variables set DATABASE_URL=postgresql://...

# Restart service
railway restart
```

**Rollback Process**:
```bash
# If quick fix fails, rollback
railway rollback

# Then fix variables for next deployment
railway variables set DATABASE_URL=postgresql://...
```

---

### Scenario 3: Dependency Version Conflict

**Problem**: New dependency version breaks functionality

**Rollback Process**:
1. Rollback application
2. Fix package.json
3. Test locally
4. Redeploy with fix

**Prevention**:
- Pin dependency versions
- Test dependencies in staging
- Use package-lock.json

---

### Scenario 4: FFmpeg Command Change

**Problem**: Updated FFmpeg command syntax causes processing failures

**Rollback Process**:
1. Rollback application immediately
2. Review FFmpeg changes
3. Test commands locally
4. Update with working syntax

**Verification**:
```bash
# Test FFmpeg after rollback
docker run --rm [image] ffmpeg -version
```

---

### Scenario 5: Memory Leak

**Problem**: New code causes memory leak, service crashes

**Detection**:
```bash
# Monitor memory usage
railway metrics

# Check for increasing memory
watch -n 10 'railway status --json | jq ".metrics.memory"'
```

**Rollback Process**:
1. Immediate rollback
2. Analyze heap dumps (if available)
3. Fix memory leak
4. Test thoroughly before redeploying

---

## Rollback Testing

### Practice Rollbacks (Monthly)

**Purpose**: Ensure team knows rollback procedures

**Process**:
1. Schedule practice session
2. Deploy to staging
3. Practice rollback
4. Time the process
5. Document learnings

**Checklist**:
- [ ] Can access Railway CLI
- [ ] Can view deployments
- [ ] Can execute rollback
- [ ] Can verify success
- [ ] Know who to notify

---

### Automated Rollback Tests

**Test in CI/CD**:
```yaml
# Add to GitHub Actions
- name: Test Rollback Capability
  run: |
    # Deploy test version
    railway up --detach
    sleep 30

    # Test rollback
    railway rollback

    # Verify
    curl -f $SERVICE_URL/health
```

---

## Emergency Contacts

**On-Call Rotation**:
- Primary: [Name, Phone]
- Secondary: [Name, Phone]
- Manager: [Name, Phone]

**Escalation Path**:
1. On-call engineer (immediate)
2. Tech lead (if unresolved in 15 min)
3. Engineering manager (if unresolved in 30 min)
4. CTO (if critical and unresolved in 1 hour)

**Communication Channels**:
- Slack: #incidents
- Email: engineering@company.com
- Phone: [On-call number]

---

## Appendix

### Useful Commands

```bash
# Status and monitoring
railway status
railway logs --follow
railway metrics

# Deployments
railway deployments list
railway rollback
railway rollback --deployment [ID]

# Variables
railway variables list
railway variables set KEY=value

# Service management
railway restart
railway scale [replicas]

# Debugging
railway shell
railway run [command]
```

### Quick Links

- Railway Dashboard: https://railway.app/dashboard
- Service Logs: https://railway.app/project/.../service/.../logs
- Metrics: https://railway.app/project/.../service/.../metrics
- Deployments: https://railway.app/project/.../service/.../deployments

---

**Maintained By**: Tester Agent
**Review Frequency**: After each rollback
**Last Reviewed**: 2025-11-08
**Last Tested**: [Date of last rollback practice]
