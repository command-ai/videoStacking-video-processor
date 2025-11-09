# Deployment Testing Strategy - Quick Reference
## Video Processor Railway Deployment

### Version: 1.0.0
### Date: 2025-11-08
### Prepared by: Tester Agent

---

## Overview

This document provides a quick reference to the comprehensive deployment testing and validation strategy for the video-processor service on Railway.

---

## Document Structure

### 📋 Main Documents

1. **DEPLOYMENT_TESTING_STRATEGY.md** (Main Document)
   - Complete testing and validation strategy
   - Pre-deployment, deployment, and post-deployment tests
   - CI/CD integration guidelines
   - Monitoring and alerting requirements

2. **DEPLOYMENT_VALIDATION_CHECKLIST.md**
   - Step-by-step deployment checklists
   - Pre-deployment verification
   - Post-deployment validation
   - Environment-specific checklists
   - Sign-off templates

3. **HEALTH_CHECK_SPECIFICATION.md**
   - Detailed health endpoint specification
   - Response formats and status codes
   - Implementation examples
   - Railway configuration
   - Monitoring integration

4. **ROLLBACK_PROCEDURES.md**
   - When to rollback (decision criteria)
   - Automated and manual rollback procedures
   - Verification checklist
   - Communication templates
   - Post-rollback actions

---

## Automated Test Scripts

### 🔧 Test Scripts Location
All scripts in: `/video-processor/scripts/`

**1. test-deployment.sh**
- Comprehensive deployment validation
- Tests health endpoint, API endpoints, infrastructure
- Runs automatically in CI/CD
- Usage: `./scripts/test-deployment.sh <service-url>`

**2. railway-integration-test.sh**
- Railway-specific integration tests
- Tests environment variables, deployment status
- Validates Railway configuration
- Usage: `./scripts/railway-integration-test.sh`

---

## CI/CD Pipeline

### 📦 GitHub Actions Workflow
Location: `/.github/workflows/deploy-video-processor.yml`

**Pipeline Stages:**
1. **Test** - Unit tests, type checking, build
2. **Docker Test** - Build and test Docker image
3. **Deploy Staging** - Deploy to staging on PR
4. **Deploy Production** - Deploy to production on main branch
5. **Notify** - Team notifications

**Automatic Rollback:**
- Triggers on test failures
- Triggers on health check failures
- Notifies team via GitHub

---

## Pre-Deployment Checklist

### ✅ Quick Checklist (5 minutes)

```bash
# 1. Run tests
npm test

# 2. Build application
npm run build

# 3. Build Docker image
docker build -t video-processor:test .

# 4. Test Docker image
docker run --rm video-processor:test ffmpeg -version
docker run --rm video-processor:test node --version

# 5. Check environment variables
railway variables list

# 6. Review deployment plan
# - [ ] Rollback plan ready
# - [ ] Team notified
# - [ ] Monitoring configured
```

---

## Deployment Process

### 🚀 Deploy to Railway

**Option 1: Automatic (via GitHub)**
1. Push to `main` branch
2. GitHub Actions runs automatically
3. Tests execute
4. Deploys to Railway
5. Runs post-deployment tests
6. Notifies team

**Option 2: Manual (via Railway CLI)**
```bash
# 1. Deploy
railway up

# 2. Monitor
railway logs --follow

# 3. Verify
curl -f https://your-service.railway.app/health

# 4. Test
./scripts/test-deployment.sh https://your-service.railway.app
```

---

## Post-Deployment Validation

### ✅ Quick Validation (2 minutes)

```bash
# 1. Health check
curl -f https://your-service.railway.app/health

# 2. Run test suite
./scripts/test-deployment.sh https://your-service.railway.app

# 3. Check logs
railway logs --tail 50

# 4. Monitor metrics
railway status
```

### 📊 Success Criteria
- ✅ Health endpoint returns 200 OK
- ✅ All automated tests pass
- ✅ No errors in logs
- ✅ Response time < 5 seconds
- ✅ Video processing works

---

## Rollback Procedures

### 🔄 Emergency Rollback (30 seconds)

```bash
# 1. Rollback
railway rollback

# 2. Verify
curl -f https://your-service.railway.app/health

# 3. Check logs
railway logs --tail 50

# 4. Notify team
# Post in #incidents channel
```

### When to Rollback
**Immediate:**
- ❌ Health check fails for 5+ minutes
- ❌ Error rate > 50%
- ❌ Service completely unresponsive

**Consider:**
- ⚠️ Error rate 10-50%
- ⚠️ Slow response times (5-30s)
- ⚠️ Intermittent failures

---

## Test Scenarios Coverage

### ✅ Pre-Deployment Tests
- [x] Docker image builds successfully
- [x] FFmpeg installed and working
- [x] All dependencies included
- [x] Environment variables configured
- [x] Prisma client generated
- [x] TypeScript compilation successful

### ✅ Deployment Tests
- [x] Railway deployment successful
- [x] Container starts without errors
- [x] Health check passes
- [x] Service responds within timeout
- [x] Database connection works
- [x] R2 storage accessible

### ✅ Post-Deployment Tests
- [x] Video processing functional
- [x] Platform-specific processing works
- [x] Performance benchmarks met
- [x] Error handling correct
- [x] Concurrent requests handled
- [x] Integration with VideoStacking works

### ✅ Operational Tests
- [x] Rollback capability verified
- [x] Monitoring and alerts active
- [x] Logs accessible
- [x] Metrics flowing
- [x] Scaling configured

---

## Monitoring & Alerting

### 📊 Key Metrics

**Service Health:**
- Health endpoint status
- Response time (target: < 5s)
- Error rate (target: < 1%)
- Uptime (target: 99.9%)

**Resource Usage:**
- CPU (alert if > 80%)
- Memory (alert if > 90%)
- Disk (alert if > 85%)

**Business Metrics:**
- Videos processed per hour
- Average processing time
- Success rate
- Platform distribution

### 🔔 Alert Configuration

**Critical Alerts:**
- Service down (3 failed health checks)
- Error rate > 5%
- Database disconnected

**Warning Alerts:**
- Error rate > 1%
- CPU > 80% for 10 minutes
- Memory > 90%

---

## Environment-Specific Configurations

### 🏗️ Development
- Auto-deploy enabled
- Debug logging
- Fast feedback
- Test data available

### 🎭 Staging
- Manual approval for deploy
- Production-like config
- Full test suite
- Performance testing

### 🚀 Production
- Manual approval required
- Full monitoring
- Alert configuration
- Rollback plan ready

---

## Test Execution Schedule

### Daily
- Automated health checks (every 5 minutes)
- Deployment test suite (on each deploy)

### Weekly
- Performance benchmarks
- Load testing
- Security scanning

### Monthly
- Rollback procedure practice
- Disaster recovery testing
- Documentation review

---

## Success Metrics

### Deployment Quality
- **Target**: 100% successful deployments
- **Current**: Track in deployment dashboard

### Time to Deploy
- **Target**: < 5 minutes from push to live
- **Current**: Measure via CI/CD metrics

### Time to Rollback
- **Target**: < 2 minutes from decision to restored
- **Current**: Practice and measure

### Service Availability
- **Target**: 99.9% uptime
- **Current**: Monitor via Railway metrics

---

## Team Responsibilities

### Before Deployment
- **Developer**: Run tests, build, prepare PR
- **Reviewer**: Code review, approve PR
- **DevOps**: Verify environment config
- **QA**: Staging validation

### During Deployment
- **On-call**: Monitor deployment
- **DevOps**: Watch Railway dashboard
- **Team**: Available for rollback

### After Deployment
- **On-call**: Verify health, run tests
- **DevOps**: Monitor for 1 hour
- **Team**: Watch for issues

---

## Quick Command Reference

### Railway Commands
```bash
# Status
railway status
railway logs --follow
railway metrics

# Deploy
railway up
railway rollback

# Configuration
railway variables list
railway variables set KEY=value

# Debugging
railway shell
railway run [command]
```

### Testing Commands
```bash
# Local tests
npm test
npm run build

# Deployment tests
./scripts/test-deployment.sh <url>
./scripts/railway-integration-test.sh

# Docker tests
docker build -t video-processor:test .
docker run --rm video-processor:test ffmpeg -version
```

### Health Check
```bash
# Basic check
curl -f https://your-service.railway.app/health

# Detailed check
curl -s https://your-service.railway.app/health | jq '.'

# Monitor continuously
watch -n 10 'curl -s https://your-service.railway.app/health | jq .status'
```

---

## Resources

### Documentation
- Main Strategy: `docs/DEPLOYMENT_TESTING_STRATEGY.md`
- Checklist: `docs/DEPLOYMENT_VALIDATION_CHECKLIST.md`
- Health Check: `docs/HEALTH_CHECK_SPECIFICATION.md`
- Rollback: `docs/ROLLBACK_PROCEDURES.md`

### Scripts
- Deployment Test: `scripts/test-deployment.sh`
- Railway Integration: `scripts/railway-integration-test.sh`

### CI/CD
- GitHub Actions: `.github/workflows/deploy-video-processor.yml`

### Configuration
- Railway Config: `railway.json`
- Docker: `Dockerfile`
- Environment: `.env.example`

---

## Support Contacts

### Emergency
- **On-Call**: [Phone/Slack]
- **Escalation**: [Manager contact]

### Regular Support
- **Slack**: #video-processor
- **Email**: engineering@company.com
- **Tickets**: [Issue tracker URL]

---

## Next Steps

### Implementation Checklist
- [ ] Review all documentation
- [ ] Set up Railway project
- [ ] Configure environment variables
- [ ] Set up GitHub Actions secrets
- [ ] Test deployment to staging
- [ ] Practice rollback procedure
- [ ] Configure monitoring
- [ ] Set up alerts
- [ ] Train team on procedures
- [ ] Schedule first production deployment

### Continuous Improvement
- [ ] Collect deployment metrics
- [ ] Review and update procedures quarterly
- [ ] Practice rollbacks monthly
- [ ] Update documentation as needed
- [ ] Gather team feedback

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-11-08 | Tester Agent | Initial deployment strategy |

---

**Questions?** Contact the Tester Agent or DevOps team.

**Last Updated**: 2025-11-08
**Next Review**: 2025-12-08
