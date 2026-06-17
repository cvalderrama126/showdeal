# ⏮️ ShowDeal Rollback Procedure

**Time to Execute**: 5 minutes max  
**Impact**: Minimal (redirects to previous version)  
**Data Loss**: None (database rollback separate)  

---

## 🚨 WHEN TO ROLLBACK

Rollback if ANY of the following occur:
- [ ] API returning 5xx errors for >30 seconds
- [ ] Database connection lost
- [ ] Authentication broken (can't login)
- [ ] Critical feature not working (bidding, uploads)
- [ ] Performance degradation (response time >2s)
- [ ] Data corruption detected
- [ ] Security issue discovered

---

## ⏪ IMMEDIATE ROLLBACK (2 minutes)

### Option 1: Revert to Previous Docker Image

```bash
# 1.1 SSH to production server
ssh deploy@showdeal-prod.example.com

# 1.2 Stop current version
cd /opt/showdeal/repo
docker-compose -f docker-compose.prod.yml down showdeal-api

# 1.3 Pull previous image
docker pull showdeal:v1.9.5-stable

# 1.4 Update docker-compose.prod.yml
sed -i 's/showdeal:latest/showdeal:v1.9.5-stable/' docker-compose.prod.yml

# 1.5 Start previous version
docker-compose -f docker-compose.prod.yml up -d showdeal-api

# 1.6 Verify health
sleep 10
curl http://localhost:3001/health

# 1.7 Revert nginx config (if needed)
# Only if nginx config changed
sudo systemctl restart nginx
```

### Option 2: Revert Git Commit

```bash
# 2.1 Identify previous commit
git log --oneline -5

# 2.2 Revert to previous version
git revert HEAD --no-edit

# OR go back to specific tag
git checkout v1.9.5-stable

# 2.3 Rebuild Docker image
docker build -t showdeal:rollback-$(date +%s) -f Dockerfile .

# 2.4 Update compose to use new image
sed -i 's/showdeal:latest/showdeal:rollback-NNN/' docker-compose.prod.yml

# 2.5 Restart services
docker-compose -f docker-compose.prod.yml up -d
```

---

## 🗄️ DATABASE ROLLBACK (if needed)

### If data was corrupted:

```bash
# 1. Stop application
docker-compose -f docker-compose.prod.yml down

# 2. List available backups
ls -lh /opt/showdeal/backups/

# 3. Restore from backup
docker-compose -f docker-compose.prod.yml exec postgres psql -U showdeal_user -d showdeal_prod < /opt/showdeal/backups/pre-launch-20260620-020000.sql

# 4. Verify restore
docker-compose -f docker-compose.prod.yml exec postgres psql -U showdeal_user -d showdeal_prod -c "SELECT COUNT(*) FROM r_user;"

# 5. Start application with previous version
docker-compose -f docker-compose.prod.yml up -d
```

---

## ✅ POST-ROLLBACK VALIDATION

After rolling back:

```bash
# 1. Health check
curl https://showdeal.com/health

# 2. Test key flows
curl -X GET https://showdeal.com/api/r_auction/count

# 3. Check logs for errors
docker-compose -f docker-compose.prod.yml logs --tail=50 showdeal-api

# 4. Verify users can login
curl -X POST https://showdeal.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"user_1":"admin","password":"testpass123"}'

# 5. Monitor for 5 minutes
docker stats --no-stream &
sleep 300
kill $!
```

---

## 📊 ROLLBACK CHECKLIST

- [ ] Decision made to rollback (documented reason)
- [ ] Team notified of rollback
- [ ] Previous version confirmed working
- [ ] Docker image or commit reverted
- [ ] Services restarted
- [ ] Health checks passing
- [ ] Users notified (if > 5 min downtime)
- [ ] RCA (Root Cause Analysis) document started
- [ ] Git revert commit pushed to main
- [ ] Monitoring returned to normal

---

## 📝 INCIDENT DOCUMENTATION

After rollback, document:

```markdown
## Incident Report

**Date**: 2026-06-20
**Time**: 18:30 UTC
**Duration**: 8 minutes
**Severity**: Critical
**Status**: Rolled Back

### What Happened
[Description of issue]

### Root Cause
[What caused the problem]

### Impact
[How many users affected, data loss, etc]

### Resolution
[Rollback to v1.9.5-stable]

### Prevention
[What to change to prevent recurrence]

### Timeline
- 18:30 - Issue detected
- 18:33 - Rollback decision made
- 18:38 - Previous version online
- 18:40 - Health checks passing
```

---

## 🔄 RECOVERY AFTER ROLLBACK

Once system is stable (30+ minutes):

1. **Post-Mortem Analysis**
   ```bash
   # Collect logs for analysis
   docker-compose -f docker-compose.prod.yml logs > /opt/showdeal/logs/incident-logs.txt
   ```

2. **Fix the Issue** (in develop branch)
   ```bash
   git checkout develop
   # Apply fixes
   git commit -m "fix: address production issue from incident"
   ```

3. **Re-Test** (in staging first)
   ```bash
   git checkout v2.0.0-fixed
   docker-compose -f docker-compose.staging.yml up -d
   # Run full test suite
   npm run test:gate
   ```

4. **Redeploy** (when confident)
   ```bash
   # Create new tag
   git tag -a v2.0.1-hotfix -m "Fix for production incident"
   git push origin v2.0.1-hotfix
   
   # Build & deploy
   docker build -t showdeal:v2.0.1-hotfix .
   # Follow deployment-guide.md steps 1-7
   ```

---

## 🛟 EMERGENCY PROCEDURES

### Database is corrupted beyond recovery

```bash
# 1. Recreate database from backup
docker-compose -f docker-compose.prod.yml exec postgres createdb -U showdeal_user showdeal_prod_recovered

# 2. Restore oldest available backup
docker-compose -f docker-compose.prod.yml exec postgres psql -U showdeal_user -d showdeal_prod_recovered < /opt/showdeal/backups/oldest-backup.sql

# 3. Verify data integrity
docker-compose -f docker-compose.prod.yml exec postgres psql -U showdeal_user -d showdeal_prod_recovered -c "SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema='public';"

# 4. Switch application to recovered database
# Update DATABASE_URL in .env.production to point to _recovered
# Restart services
```

### Complete server failure

If the server is unrecoverable:

```bash
# 1. Provision new server (same specs as original)
# 2. Deploy with backup: follow deployment-guide.md but restore latest backup
# 3. Update DNS to point to new IP
# 4. Monitor for 2+ hours
# 5. Decommission old server (keep for forensics)
```

---

## ✨ ROLLBACK SUCCESS CRITERIA

Rollback is successful when:

- [x] API health endpoint returns 200
- [x] Database connectivity verified
- [x] Authentication working
- [x] All critical APIs responding
- [x] No 5xx errors in logs
- [x] Response times < 1s (normal)
- [x] No data corruption
- [x] Users can access platform

---

## 📞 WHO TO CONTACT

If rollback needed:

1. **Notify Team** - Slack #incidents
2. **On-Call Engineer** - Phone + SMS
3. **Tech Lead** - Email + Phone
4. **DevOps** - Execute rollback
5. **Product** - Notify affected users

---

**Rollback Procedure v1.0** | Last Updated: Junio 2026  
**Keep printed copy** in your desk for emergencies!
