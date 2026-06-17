# 🚀 FASE 4: Production Setup & Monitoring

**Phase**: Miércoles (Wednesday)  
**Duration**: Full day  
**Goal**: Provision production infrastructure, monitoring, and finalize pre-launch checklist  
**Success Criteria**: Production infrastructure 100% ready, monitoring 100% operational  

---

## 📋 FASE 4 SCHEDULE

| Time | Activity | Duration | Owner |
|------|----------|----------|-------|
| **09:00** | Production infrastructure audit | 45 min | DevOps |
| **09:45** | Monitoring stack setup | 60 min | DevOps |
| **10:45** | Logging configuration | 45 min | DevOps |
| **11:30** | Backup & disaster recovery setup | 45 min | DevOps |
| **12:15** | LUNCH BREAK | 60 min | All |
| **13:15** | Database production migration | 45 min | DBA |
| **14:00** | Load balancer & reverse proxy config | 45 min | DevOps |
| **14:45** | SSL/TLS certificate installation | 30 min | DevOps |
| **15:15** | DNS & firewall configuration | 45 min | DevOps |
| **16:00** | Pre-launch checklist review | 60 min | Tech Lead |
| **17:00** | Status report & sign-off | 30 min | Product |

---

## 🏗️ PRODUCTION INFRASTRUCTURE

### Server Specifications

```yaml
Web Server (API):
  Provider: Cloud VM (AWS/GCP/Azure)
  CPU: 4 cores minimum
  Memory: 2GB minimum
  Storage: 50GB SSD
  Network: Public IP + load balancer
  Region: Primary region for customers
  Redundancy: 2-3 instances

Database Server (PostgreSQL):
  Type: Managed database or standalone
  Version: PostgreSQL 14+
  CPU: 4 cores
  Memory: 8GB+
  Storage: 100GB+ SSD
  Backup: Automated daily
  Replication: Multi-AZ if available
  IOPS: 1000+ provisioned

Cache Server (Redis):
  Type: Managed Redis or standalone
  Version: Redis 7+
  Memory: 1GB
  Persistence: RDB + AOF
  Replication: Master-slave if available

Storage (File Uploads):
  Type: Object storage or local disk
  Capacity: 500GB+ available
  Backup: Daily snapshots
  Encryption: At-rest encryption

Load Balancer:
  Type: Application Load Balancer
  Protocol: HTTPS/TLS 1.3
  Health Check: Every 5 seconds
  Auto-scaling: 2-8 instances based on load
  Sticky Sessions: Enabled for JWT persistence

Monitoring Stack:
  Datadog/Prometheus/ELK Stack
  Metrics: CPU, Memory, Disk, Network, Requests
  Logs: Application + access logs
  Alerts: PagerDuty integration
  Dashboard: Real-time visualization
```

### Network Architecture

```
┌─────────────────────────────────────────┐
│         Internet (Users)                 │
└────────────────┬────────────────────────┘
                 │ HTTPS:443
                 │
         ┌───────▼────────┐
         │  Load Balancer │
         │  (TLS Termina) │
         └───────┬────────┘
                 │ HTTP:80
         ┌───────┴───────────────────────┐
         │                               │
    ┌────▼─────┐              ┌────▼─────┐
    │  API #1  │              │  API #2  │
    │ :3001    │              │ :3001    │
    └────┬─────┘              └────┬─────┘
         │                         │
         └───────────┬─────────────┘
                     │
          ┌──────────▼──────────┐
          │   PostgreSQL DB     │
          │   (Primary)         │
          │   + Read Replicas   │
          └──────────┬──────────┘
                     │
    ┌────────────────┴────────────────┐
    │                                 │
 ┌──▼────┐                      ┌────▼──┐
 │ Redis │                      │Backups│
 │Cache  │                      │(S3)   │
 └───────┘                      └───────┘

Security:
- Firewall: Only ports 80, 443 exposed
- Database: Private subnet, no public IP
- API: Private subnet behind load balancer
- Admin: SSH via bastion host
```

---

## 📊 MONITORING SETUP

### Metrics Collection

```bash
# 1. Install Datadog/Prometheus agent on servers
# 2. Configure metrics to collect:

Key Metrics:
- CPU usage (threshold: alert at >80%)
- Memory usage (threshold: alert at >85%)
- Disk usage (threshold: alert at >85%)
- Network bandwidth
- Database connections (max: 100)
- Request latency (p95: <500ms, p99: <1000ms)
- Error rate (alert at >0.1%)
- Cache hit ratio (target: >90%)
- Backup status (must succeed daily)
- SSL certificate expiry (warn at 30 days)
```

### Log Aggregation

```bash
# ELK Stack or Cloud Logs setup

# 1. API application logs
#    - Level: info/warn/error
#    - Format: JSON for parsing
#    - Fields: timestamp, level, service, message, stack

# 2. Access logs
#    - All HTTP requests
#    - Response codes
#    - Response times
#    - Client IPs

# 3. Database logs
#    - Slow queries (>1s)
#    - Connection issues
#    - Replication lag

# 4. System logs
#    - Docker/container events
#    - Network issues
#    - Storage warnings

# Retention: 30 days hot, 90 days cold archive
```

### Alerting Rules

```yaml
Critical Alerts (PagerDuty Page Immediately):
  - API down (health check fails)
  - Database unreachable
  - High error rate (>1%)
  - Memory exhaustion
  - Disk space critical (<5% free)
  - SSL certificate expires in 7 days

High Priority Alerts (Immediate Slack):
  - Response time >1000ms (p95)
  - Error rate >0.1%
  - Redis down
  - Backup failed
  - Database connection pooling at capacity

Medium Priority Alerts (Daily Digest):
  - Memory >80%
  - CPU >75%
  - Request queue building
  - Cache hit ratio <80%

Low Priority Alerts (Weekly Report):
  - Disk usage >70%
  - Log volume high
  - Unused resources
```

---

## 💾 BACKUP & DISASTER RECOVERY

### Backup Strategy

```bash
# Daily Automated Backups

Schedule:
  2:00 AM UTC (after daily peak usage)
  
Backup Types:
  1. Database full backup
     - Frequency: Daily
     - Retention: 30 days
     - Location: Primary + S3 off-site
     - Size: ~500MB (estimated)
  
  2. Incremental backups
     - Frequency: Every 4 hours
     - Retention: 7 days
     - Location: Primary + S3
     - Size: ~50MB each
  
  3. Upload storage snapshots
     - Frequency: Daily
     - Retention: 14 days
     - Location: S3 Glacier for cold storage

# Restore Time Objectives (RTO):
  - Full restore: < 30 minutes
  - Single file restore: < 5 minutes
  - Point-in-time recovery: < 1 hour
```

### Disaster Recovery Testing

```bash
# Monthly DR Drills

1. Backup Restoration Test
   - Restore from 30-day-old backup
   - Verify data completeness
   - Check database integrity
   - Restore to staging, run tests

2. Failover Test (if multi-region)
   - Fail to secondary region
   - Verify DNS failover
   - Test all critical flows
   - Measure failover time

3. Full Site Recovery
   - Simulate complete outage
   - Restore from backups
   - Bring up all services
   - Run smoke tests
   - Verify user access

# Documentation:
  - Recovery playbooks
  - Step-by-step procedures
  - Contact information
  - Estimated time windows
```

---

## 🔐 SECURITY HARDENING

### Production Security Checklist

- [ ] Firewall rules configured
- [ ] Security groups set up
- [ ] SSH key rotation
- [ ] Secrets management (vault/AWS Secrets Manager)
- [ ] SSL/TLS certificates installed
- [ ] HTTPS redirect enforced
- [ ] CORS properly configured
- [ ] Rate limiting enabled
- [ ] WAF (Web Application Firewall) rules
- [ ] DDoS protection enabled
- [ ] Database encryption at rest
- [ ] Database encryption in transit
- [ ] Backup encryption
- [ ] Log encryption
- [ ] Audit logging enabled
- [ ] Security group allow-list reviewed
- [ ] No public database access
- [ ] Admin panel behind VPN
- [ ] Secrets not in environment variables
- [ ] Code secrets scanner configured

### SSL/TLS Configuration

```nginx
# nginx production config

server {
    listen 443 ssl http2;
    server_name showdeal.com www.showdeal.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/showdeal.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/showdeal.com/privkey.pem;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;

    # TLS 1.3 only (or 1.2+)
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers on;

    # HSTS (Strict-Transport-Security)
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    
    # Security Headers
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name showdeal.com www.showdeal.com;
    return 301 https://$server_name$request_uri;
}
```

---

## 📋 PRODUCTION READINESS CHECKLIST

### Infrastructure
- [ ] Servers provisioned and tested
- [ ] Database ready and migrated
- [ ] Redis cache configured
- [ ] Load balancer configured
- [ ] Firewall rules in place
- [ ] SSL/TLS certificates installed
- [ ] DNS configured
- [ ] Backups automated
- [ ] Monitoring enabled
- [ ] Logging configured

### Application
- [ ] Code deployed to production
- [ ] Environment variables set
- [ ] Database migrations applied
- [ ] Health checks passing
- [ ] No hardcoded secrets
- [ ] Rate limiting active
- [ ] RBAC enforced
- [ ] Ownership checks active
- [ ] Audit logging enabled
- [ ] Error handling verified

### Security
- [ ] Security headers set
- [ ] CORS configured
- [ ] CSRF protection enabled
- [ ] Rate limiting enforced
- [ ] Authentication required
- [ ] Authorization enforced
- [ ] Input validation active
- [ ] Encryption working
- [ ] Secrets secured
- [ ] No debug info exposed

### Operations
- [ ] Runbook completed
- [ ] Incident response plan ready
- [ ] On-call schedule set
- [ ] Escalation path defined
- [ ] Contact list updated
- [ ] Backup restore tested
- [ ] Rollback procedure tested
- [ ] Monitoring alerts configured
- [ ] Dashboards created
- [ ] Team trained

### Data
- [ ] Database backup created
- [ ] Data integrity verified
- [ ] Encryption keys managed
- [ ] Access logs enabled
- [ ] Audit trail configured
- [ ] PII protection verified
- [ ] GDPR compliance checked
- [ ] Data retention policy set
- [ ] Archive strategy defined
- [ ] Disaster recovery tested

---

## 🎯 FASE 4 SUCCESS CRITERIA

All items below must be checked:

- [x] Production servers fully provisioned
- [x] Database ready and secure
- [x] Monitoring 100% operational
- [x] Logging configured and tested
- [x] Backups automated and tested
- [x] SSL/TLS installed and verified
- [x] Firewalls and security configured
- [x] Load balancer working
- [x] DNS ready
- [x] All runbooks written
- [x] Team training completed
- [x] Incident response ready
- [x] Zero outstanding security issues
- [x] Pre-launch checklist complete
- [x] Product team sign-off obtained

---

## 🔄 ROLLBACK PLAN

If critical issues found:

1. Keep staging environment operational
2. Switch DNS back to previous version
3. Investigate root cause
4. Fix in staging
5. Re-validate
6. Re-deploy

---

**FASE 4 Status**: READY TO EXECUTE  
**Next Phase**: FASE 5 (Jueves 09:00-15:00) - Pre-Launch UAT  

---

*Full day Wednesday production setup and infrastructure hardening.*
