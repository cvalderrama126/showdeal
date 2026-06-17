# 📘 ShowDeal Production Runbook

**For**: On-Call Engineers, DevOps Team, Support Staff  
**Last Updated**: Junio 2026  
**Critical Path**: Pages → Health Check → Incident Response  

---

## 🚨 EMERGENCY CONTACTS

| Role | Contact | Backup |
|------|---------|--------|
| Tech Lead | +1-XXX-XXX-XXXX | Slack @tech-lead |
| DevOps | +1-XXX-XXX-XXXX | Slack @devops |
| Product | +1-XXX-XXX-XXXX | Slack @product |
| Support | Slack #support | Email support@showdeal.com |

---

## ⚡ QUICK START: Is ShowDeal Down?

### 1️⃣ Run Health Check (30 seconds)

```bash
# SSH to production
ssh deploy@showdeal-prod.example.com

# Run health check
cd /opt/showdeal/repo
node healthcheck-production.js
```

**Expected output:**
```
✅ API Server Health
✅ Database Connectivity
✅ Redis Cache
✅ SSL/TLS Certificate
✅ Performance Benchmarks
✅ Security Headers
```

### 2️⃣ If Any Check Fails

| Failure | Action | Time |
|---------|--------|------|
| **API Health** | Restart API container → See "Restart Services" | 2 min |
| **Database** | Check DB logs → See "Database Issues" | 5 min |
| **Redis** | Restart Redis → See "Cache Issues" | 2 min |
| **SSL** | Check certificate expiry → Renew if needed | 5 min |
| **Performance** | Check load → Scale if needed | 10 min |

### 3️⃣ Notify Users (if >5 min downtime)

1. Post to **#incidents** Slack channel
2. Update **Status Page** (status.showdeal.com)
3. Send **Email notification** to affected users

---

## 🔧 COMMON OPERATIONS

### Check API Status

```bash
# Health check with detailed info
curl -i https://showdeal.com/health

# Check recent error logs
docker-compose -f docker-compose.prod.yml logs --tail=50 showdeal-api | grep -i error

# Monitor real-time logs
docker-compose -f docker-compose.prod.yml logs -f --tail=20 showdeal-api
```

### Restart Services

```bash
# Restart API only
docker-compose -f docker-compose.prod.yml restart showdeal-api
sleep 5
curl https://showdeal.com/health

# Restart all services
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d
sleep 10
curl https://showdeal.com/health

# Force restart (even if healthy)
docker-compose -f docker-compose.prod.yml kill showdeal-api
docker-compose -f docker-compose.prod.yml up -d showdeal-api
```

### Check Database Status

```bash
# Connect to PostgreSQL
docker-compose -f docker-compose.prod.yml exec postgres psql -U showdeal_user -d showdeal_prod

# Inside psql:
\dt                           # List tables
SELECT COUNT(*) FROM r_user;  # Check user count
SELECT COUNT(*) FROM r_auction; # Check auctions
\q                            # Exit

# Check database size
docker-compose -f docker-compose.prod.yml exec postgres psql -U showdeal_user -d showdeal_prod -c "SELECT pg_size_pretty(pg_database_size('showdeal_prod'));"

# Kill stuck connections
docker-compose -f docker-compose.prod.yml exec postgres psql -U showdeal_user -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='showdeal_prod' AND state='idle';"
```

### Check Redis Cache

```bash
# Redis CLI
docker-compose -f docker-compose.prod.yml exec redis redis-cli

# Inside redis-cli:
PING                   # Should return PONG
DBSIZE                 # Check key count
FLUSHDB                # Clear cache (caution!)
INFO memory            # Check memory usage
QUIT                   # Exit

# Monitor Redis in real-time
docker-compose -f docker-compose.prod.yml exec redis redis-cli MONITOR
```

### View Application Logs

```bash
# Last 100 lines
docker-compose -f docker-compose.prod.yml logs --tail=100 showdeal-api

# Follow logs (real-time)
docker-compose -f docker-compose.prod.yml logs -f showdeal-api

# Filter by log level
docker-compose -f docker-compose.prod.yml logs showdeal-api | grep "ERROR"

# Save logs to file
docker-compose -f docker-compose.prod.yml logs showdeal-api > /tmp/api-logs.txt
```

### Monitor Resource Usage

```bash
# Real-time stats
docker stats --no-stream

# If container is using too much memory:
# 1. Increase container memory limit in docker-compose.prod.yml
# 2. Restart container
# 3. Monitor usage

# Check disk space
df -h /opt/showdeal

# If disk is full:
# 1. Clean old logs: rm -f /opt/showdeal/logs/*.log.1
# 2. Clean old backups: rm -f /opt/showdeal/backups/*-30-days-old
# 3. Monitor again
```

---

## 🚨 INCIDENT RESPONSE

### API Returning 500 Errors

```bash
# 1. Check logs for error messages
docker-compose -f docker-compose.prod.yml logs --tail=50 showdeal-api | grep -i error

# 2. Common causes:
#    - Database connection lost → Check DB status
#    - Out of memory → Check docker stats
#    - Crashed process → Check container status

# 3. Quick fix: Restart API
docker-compose -f docker-compose.prod.yml restart showdeal-api
sleep 5

# 4. Verify fix
curl https://showdeal.com/health

# 5. If persists → Escalate to Tech Lead
```

### Database Connection Errors

```bash
# 1. Check if PostgreSQL is running
docker-compose -f docker-compose.prod.yml ps postgres

# 2. Check PostgreSQL logs
docker-compose -f docker-compose.prod.yml logs postgres

# 3. Test connection
docker-compose -f docker-compose.prod.yml exec postgres psql -U showdeal_user -d showdeal_prod -c "SELECT 1"

# 4. If connection refused:
docker-compose -f docker-compose.prod.yml restart postgres
sleep 10

# 5. Run migrations (if needed)
docker-compose -f docker-compose.prod.yml exec showdeal-api npx prisma migrate deploy

# 6. Verify data integrity
docker-compose -f docker-compose.prod.yml exec postgres psql -U showdeal_user -d showdeal_prod -c "SELECT COUNT(*) FROM r_user;"
```

### High Latency / Slow Responses

```bash
# 1. Check API response times
docker-compose -f docker-compose.prod.yml logs showdeal-api | grep "response time"

# 2. Check database query performance
docker-compose -f docker-compose.prod.yml exec postgres psql -U showdeal_user -d showdeal_prod -c "SELECT query, calls, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 5;"

# 3. Check if indexes are missing
docker-compose -f docker-compose.prod.yml exec postgres psql -U showdeal_user -d showdeal_prod -c "\d r_auction"

# 4. Check container resources
docker stats --no-stream | grep showdeal-api

# 5. If CPU/Memory saturated → Scale horizontally or investigate queries
```

### Memory Leak (Container keeps growing)

```bash
# 1. Monitor memory over time
watch -n 5 'docker stats --no-stream | grep showdeal-api'

# 2. Check for connection leaks
docker-compose -f docker-compose.prod.yml exec postgres psql -U showdeal_user -d postgres -c "SELECT usename, COUNT(*) FROM pg_stat_activity GROUP BY usename;"

# 3. Check Redis memory
docker-compose -f docker-compose.prod.yml exec redis redis-cli INFO memory

# 4. If confirmed memory leak:
#    - Restart container: docker-compose restart showdeal-api
#    - Scale container limits in docker-compose.prod.yml
#    - Report to Tech Lead for debugging

# 5. Restart with memory limit
docker-compose -f docker-compose.prod.yml down
# Edit docker-compose.prod.yml to add: memory: "512m"
docker-compose -f docker-compose.prod.yml up -d
```

### Disk Space Full

```bash
# 1. Check disk usage
df -h /opt/showdeal

# 2. Find large files
du -sh /opt/showdeal/* | sort -hr

# 3. Safe cleanup:
rm -f /opt/showdeal/logs/*.log.1     # Old rotated logs
rm -f /opt/showdeal/uploads/temp/*   # Temp files
rm -f /opt/showdeal/backups/*-30+    # Backups older than 30 days

# 4. If still full → Check Docker image layers
docker system df

# 5. Clean Docker
docker system prune -a --volumes    # CAUTION: Deletes unused images!

# 6. If database is large
du -sh /var/lib/docker/volumes/
# Migrate to larger volume or add secondary storage
```

---

## 📊 MONITORING

### Key Metrics to Watch

| Metric | Healthy | Warning | Critical |
|--------|---------|---------|----------|
| **API Response Time** | <200ms | 200-500ms | >500ms |
| **Database Queries** | <100ms | 100-500ms | >500ms |
| **Error Rate** | <0.1% | 0.1-1% | >1% |
| **Memory Usage** | <60% | 60-80% | >80% |
| **Disk Usage** | <70% | 70-85% | >85% |
| **Active Connections** | <50 | 50-100 | >100 |

### Setting Up Alerts

```bash
# Datadog example
curl -X POST "https://api.datadoghq.com/api/v1/monitor" \
  -H "DD-API-KEY: ${DATADOG_API_KEY}" \
  -d @- <<'EOF'
{
  "name": "ShowDeal API Error Rate High",
  "type": "metric alert",
  "query": "avg(last_5m):avg:trace.web.request.errors{service:showdeal} > 0.01",
  "thresholds": {"critical": 0.01},
  "notification_preset_name": "show_all"
}
EOF
```

---

## 🔄 SCHEDULED MAINTENANCE

### Daily (Automated via Cron)

```bash
# Backup database (2 AM daily)
0 2 * * * /opt/showdeal/repo/scripts/backup-database.sh

# Check disk usage (hourly)
0 * * * * df -h /opt/showdeal >> /opt/showdeal/logs/disk-usage.log

# Rotate logs (daily)
0 3 * * * find /opt/showdeal/logs -name "*.log" -mtime +7 -delete
```

### Weekly

- Monday 2 AM: Full backup
- Wednesday 3 AM: Database optimization (VACUUM ANALYZE)
- Friday 4 AM: Security log review

### Monthly

- 1st: Database health check
- 15th: Capacity planning review
- Last day: Update runbook and procedures

---

## 🔐 SECURITY CHECKS

### SSL/TLS Certificate Status

```bash
# Check certificate expiry
openssl s_client -connect showdeal.com:443 -showcerts | grep -E "subject=|issuer=|notBefore=|notAfter="

# Days until expiry
echo | openssl s_client -connect showdeal.com:443 2>/dev/null | openssl x509 -noout -dates | grep notAfter
```

### Check for Security Vulnerabilities

```bash
# Scan Docker image
trivy image showdeal:latest

# Check npm dependencies
npm audit

# OWASP ZAP scan (if available)
zaproxy -cmd -quickurl https://showdeal.com
```

### Verify Secrets Not Leaked

```bash
# Check environment variables
docker-compose -f docker-compose.prod.yml logs showdeal-api | grep -i "password\|secret\|key"

# Check application config
docker-compose -f docker-compose.prod.yml exec showdeal-api grep -r "password\|secret" src/ --include="*.js" | grep -v "// password" | wc -l
# Should return 0 (no hardcoded secrets)
```

---

## 📞 ESCALATION PATH

### Level 1: Automated Recovery (On-Call)
- Health check fails → Restart services
- Logs show known error → Apply quick fix
- Memory leak → Restart container

### Level 2: Manual Intervention (On-Call)
- Unclear error → Check logs and database
- Performance issue → Investigate queries
- Configuration error → Fix .env variables

### Level 3: Engineering Team
- Code bug suspected → Review git commits
- Architecture issue → Design fix
- Data corruption → Restore from backup

### Level 4: Escalation
- Multiple systems down → Incident commander
- Data loss → CTO + Product
- Security breach → Security team + Legal

---

## 📚 ADDITIONAL RESOURCES

- [Deployment Guide](./deployment-guide.md)
- [Rollback Procedure](./rollback-procedure.md)
- [Health Check Script](./healthcheck-production.js)
- [Backup/Restore Scripts](./scripts/)
- [Docker Compose Config](./docker-compose.prod.yml)

---

**PrintMe**: Print this page and keep a copy at your desk! 📋

**Last Updated**: Junio 2026  
**Next Review**: Julio 2026
