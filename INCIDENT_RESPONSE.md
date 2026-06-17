# 🚨 ShowDeal Incident Response Plan

**For**: All Team Members  
**Severity Levels**: P0 (Critical), P1 (High), P2 (Medium), P3 (Low)  
**Response Time SLA**: P0: 15 min, P1: 1 hour, P2: 4 hours, P3: 24 hours  

---

## 📊 INCIDENT SEVERITY MATRIX

| Severity | Impact | Examples | Response | Escalation |
|----------|--------|----------|----------|------------|
| **P0** | Complete service down, data loss, security breach | API down, DB corrupted, hack detected | 15 minutes | CEO + All leads |
| **P1** | Major feature broken, significant users affected | Auth broken, auctions can't bid, upload broken | 1 hour | Tech + Product lead |
| **P2** | Feature partially broken, minor users affected | Slow response, 1 feature down | 4 hours | Tech lead |
| **P3** | Cosmetic issue, no user impact | UI bug, email typo | 24 hours | Reporter only |

---

## 🎯 INCIDENT RESPONSE WORKFLOW

```
DETECT → ALERT → TRIAGE → RESPOND → RESOLVE → COMMUNICATION → POST-MORTEM
 1 min    3 min    5 min    15 min    varies      5 min         24 hours
```

---

## STEP 1: DETECT & ALERT (1-3 minutes)

### How Incidents Are Detected

- [ ] Automated monitoring alerts (Datadog, PagerDuty)
- [ ] User reports via support@showdeal.com
- [ ] Team member notices issue
- [ ] Error tracking (Sentry) triggers threshold

### Immediate Actions

```bash
# 1. Acknowledge alert in PagerDuty
#    (Auto-triggers on-call engineer)

# 2. Slack notification
#    → #incidents channel created automatically

# 3. Check status page
#    → Update to "Investigating"
```

---

## STEP 2: TRIAGE & ASSESSMENT (3-5 minutes)

**On-Call Engineer runs:**

```bash
# 1. Quick health check
curl -I https://showdeal.com/health
docker-compose -f docker-compose.prod.yml ps

# 2. Assess severity
#    - Is API responding? → P1+
#    - Is DB accessible? → P1+
#    - Is data corrupted? → P0
#    - Is security breach? → P0
#    - Can users access? → P1-P2
#    - Is performance bad? → P2-P3

# 3. Quick log check
docker-compose -f docker-compose.prod.yml logs --tail=20 showdeal-api | tail -20
```

### Severity Assessment

| Question | Answer | Severity |
|----------|--------|----------|
| API responding to health check? | ❌ No | P0 |
| Users getting 5xx errors? | ✅ Yes | P0-P1 |
| Database connected? | ❌ No | P0 |
| Specific feature broken? | ✅ Yes | P1-P2 |
| Performance degraded? | ✅ Yes | P2 |

---

## STEP 3: ESTABLISH INCIDENT COMMAND

**For P0 incidents:**

1. **On-Call Engineer** = Incident Commander
2. **Tech Lead** = Technical Lead (via emergency call)
3. **Product Lead** = Communication & Business Impact
4. **DevOps** = Infrastructure & Deployment

**Incident Commander's Checklist**

```markdown
- [ ] Create incident ticket (INCIDENT-XXXX)
- [ ] Open Slack thread in #incidents
- [ ] Call emergency team (3-way bridge)
- [ ] Set status: "Major Incident - Investigating"
- [ ] Establish update frequency (every 15 min if P0)
- [ ] Designate scribe (documents timeline)
- [ ] Assign: investigation, communication, coordination
```

---

## STEP 4: RESPOND & REMEDIATE (15-30 minutes)

### Investigation Playbook

**If API is down:**
```bash
docker-compose -f docker-compose.prod.yml logs showdeal-api | grep -i error
docker stats --no-stream
# If OOM: Add memory → Restart
# If crashed: Check logs → Fix & restart
```

**If database is down:**
```bash
docker-compose -f docker-compose.prod.yml exec postgres pg_isready
docker-compose -f docker-compose.prod.yml logs postgres | tail -50
# If full: Add storage → Restart
# If corrupted: Restore from backup
```

**If authentication broken:**
```bash
# Test login endpoint
curl -X POST https://showdeal.com/api/auth/login \
  -d '{"user_1":"test","password":"test"}'

# Check JWT_SECRET in .env.production
# If wrong: Update & restart
```

**If auctions can't bid:**
```bash
# Check database constraints
docker-compose -f docker-compose.prod.yml exec postgres psql -U showdeal_user -d showdeal_prod -c "\d r_bid"

# Check application logs for bid errors
docker-compose -f docker-compose.prod.yml logs showdeal-api | grep -i "bid\|constraint"
```

### Common Quick Fixes

| Issue | Quick Fix | Time |
|-------|-----------|------|
| API out of memory | Restart container | 2 min |
| Database connection lost | Restart postgres | 3 min |
| High memory leak | Restart + scale up | 5 min |
| Bad config | Update .env + restart | 5 min |
| Slow queries | Kill stuck transactions | 3 min |
| Disk full | Clean logs/backups | 5 min |

### When to Rollback

**Rollback immediately if:**

- [ ] Error introduced in last commit (confirmed)
- [ ] Can't fix within 5 minutes
- [ ] Data integrity at risk
- [ ] Multiple critical features broken

**Rollback procedure:**
```bash
git revert HEAD
docker build -t showdeal:rollback .
# Follow deployment-guide.md steps 3-6
```

---

## STEP 5: RESOLVE & STABILIZE (Varies)

Once fix is applied:

```bash
# 1. Verify fix
curl https://showdeal.com/health
docker-compose -f docker-compose.prod.yml logs --tail=20 showdeal-api

# 2. Monitor for 5+ minutes
watch -n 5 'curl -s https://showdeal.com/health | jq'
docker stats --no-stream

# 3. Smoke tests
#    - User can login
#    - User can place bid
#    - File upload works
#    - Database queries fast

# 4. Check error rate
#    - Should return to <0.1%
#    - No new errors in logs
```

### Resolution Sign-Off

```markdown
## Incident Resolved

**Incident**: INCIDENT-0042  
**Duration**: 28 minutes  
**Root Cause**: OOM in API container  
**Fix**: Increased memory limit from 256MB to 512MB  
**Verification**:
  - ✅ Health check passing
  - ✅ 5min monitoring clean
  - ✅ User login working
  - ✅ Auctions responding

**Status**: RESOLVED  
**Cleanup**: Monitor for 24h for recurrence
```

---

## STEP 6: COMMUNICATION (5-10 minutes)

### Update Status Page

```markdown
**Status**: RESOLVED
**Duration**: 28 minutes (10:15 - 10:43 UTC)
**Impact**: API was unavailable
**Root Cause**: Memory limit exceeded
**Resolution**: Increased container memory limit
**Next Steps**: Post-mortem review scheduled for tomorrow
```

### Notify Users

**Email Template (for P0 incidents >15 min):**

```
Subject: ShowDeal Service Restored - Incident Report

Dear Customers,

ShowDeal experienced a service disruption today from 10:15-10:43 UTC.

WHAT HAPPENED:
The API server ran out of memory and crashed, preventing all users from accessing the platform.

IMPACT:
- ~2 hours of service downtime
- ~150 users affected
- No data loss

RESOLUTION:
We identified and fixed the issue by increasing the server memory limit.

PREVENTION:
We've implemented:
- Automatic memory monitoring with alerts
- Larger container memory allocation
- Memory usage optimization

We apologize for the disruption and appreciate your patience.

Best regards,  
ShowDeal Engineering Team
```

### Slack Update Channel

```
🔴 → 🟡 → 🟢 Status progression

10:15 UTC - 🔴 API DOWN - All auctions unreachable
10:20 UTC - 🟡 INVESTIGATING - OOM detected
10:30 UTC - 🟡 MITIGATING - Restarting services
10:43 UTC - 🟢 RESOLVED - API responding normally
```

---

## STEP 7: POST-MORTEM (24 hours)

### Post-Mortem Meeting

**Within 24 hours of resolution:**

```markdown
## Incident Post-Mortem

**Incident**: INCIDENT-0042 - API Memory Exhaustion  
**Date**: 2026-06-20  
**Participants**: Tech Lead, DevOps, On-Call Engineer  
**Duration**: 28 minutes  

### Timeline
- 10:15: Memory alert triggered
- 10:18: On-call engineer paged
- 10:20: Root cause identified (OOM)
- 10:30: Container restarted
- 10:43: Service restored

### Root Cause Analysis
API container had hardcoded 256MB limit, but application memory grew to 350MB due to:
- 1. No connection pooling limit
- 2. Cache not being evicted
- 3. Memory leak in bid processing

### Contributing Factors
- Monitoring alerts not configured
- No automatic scaling policy
- Container limits not reviewed before launch

### Immediate Actions (Within 1 day)
- [x] Increase container memory to 512MB
- [x] Enable memory monitoring with alerts
- [x] Review all container resource limits

### Long-term Actions (Within 1 week)
- [ ] Implement automatic scaling policy
- [ ] Add memory profiling to CI/CD
- [ ] Quarterly resource capacity review
- [ ] Implement connection pooling

### Prevention
Going forward:
1. ✅ Monitor memory usage continuously
2. ✅ Alert at 70% memory usage
3. ✅ Auto-scale if available
4. ✅ Monthly capacity reviews

### Lessons Learned
1. Resource limits should match expected load
2. Monitoring should be set up BEFORE incidents
3. Documentation helps faster incident response

### Action Items
| Action | Owner | Deadline |
|--------|-------|----------|
| Implement auto-scaling | DevOps | Jun 27 |
| Add memory profiling | Tech Lead | Jun 30 |
| Update monitoring rules | DevOps | Jun 22 |
| Train team on scaling | Tech Lead | Jun 25 |
```

### Distribution

1. Post in **#incidents** Slack channel
2. Email to **leadership@showdeal.com**
3. Add to **Incident Database** (searchable archive)
4. Reference in **Runbook** if procedures changed

---

## 🔗 ESCALATION PHONE TREE

```
DETECT → On-Call Engineer (auto-paged)
    ↓
   P0? → YES → Call Tech Lead → Call CEO
    ↓ NO
   P1? → YES → Message Tech Lead
    ↓ NO
   P2? → YES → Slack Tech Lead
    ↓ NO
   P3? → YES → Create ticket
```

---

## ⏱️ RESPONSE TIME TARGETS

| Severity | Detect | Triage | Fix | Communicate | SLA |
|----------|--------|--------|-----|--------------|-----|
| **P0** | <5 min | <5 min | <15 min | <5 min | **30 min** |
| **P1** | <10 min | <10 min | <30 min | <10 min | **1 hour** |
| **P2** | <30 min | <15 min | <2 hours | <15 min | **4 hours** |
| **P3** | <1 day | <1 day | <1 day | <1 day | **24 hours** |

---

## 📋 INCIDENT CHECKLIST

### Immediate Response (First 5 min)

- [ ] Incident acknowledged
- [ ] Severity assessed
- [ ] Status page updated to "Investigating"
- [ ] Incident commander assigned
- [ ] On-call team called/messaged

### Investigation (5-30 min)

- [ ] Root cause identified
- [ ] Logs collected
- [ ] Fix designed
- [ ] Fix implemented
- [ ] Fix verified

### Communication (During + after)

- [ ] Users notified
- [ ] Status page updated
- [ ] Team kept in loop
- [ ] Incident ticket created
- [ ] Scribe notes collected

### Follow-up (24+ hours)

- [ ] Post-mortem scheduled
- [ ] RCA completed
- [ ] Action items created
- [ ] Runbook updated
- [ ] Team trained

---

## 🎓 TRAINING SCENARIOS

### Scenario 1: API Outage
```bash
# Simulate: Kill API container
docker kill showdeal-api
# Response: Detect → Alert → Restart → Verify
# Time: 5-10 minutes
```

### Scenario 2: Database Failure
```bash
# Simulate: Stop PostgreSQL
docker stop postgres
# Response: Detect → Alert → Restart → Verify
# Time: 10-15 minutes
```

### Scenario 3: Memory Leak
```bash
# Simulate: Reduce container memory limit
# docker-compose.prod.yml: memory: "64m"
# Response: Detect → Diagnose → Scale → Verify
# Time: 15-20 minutes
```

### Scenario 4: Security Breach
```bash
# Simulate: Try SQL injection on login endpoint
# Response: Detect → Quarantine → Assess damage → Communicate
# Time: 30+ minutes (most complex)
```

---

## 📞 GETTING HELP

**Incident Command Center**: Slack #incidents  
**On-Call Pager**: PagerDuty  
**Emergency Line**: Call Tech Lead  
**Status Page**: https://status.showdeal.com

---

**Last Updated**: Junio 2026  
**Next Review**: Julio 2026  
**Keep Printed**: On your desk for emergencies!
