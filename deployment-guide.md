# 🚀 ShowDeal Production Deployment Guide

**Version**: 1.0  
**Date**: Junio 2026  
**Target**: Production Environment  
**Rollback**: 5 minutes max  

---

## 📋 PRE-DEPLOYMENT CHECKLIST

### Infrastructure Ready
- [ ] Production server provisioned (Docker-capable)
- [ ] PostgreSQL 14+ installed or container ready
- [ ] Redis 7+ installed or container ready
- [ ] SSL/TLS certificates obtained
- [ ] DNS records updated to point to new server
- [ ] Firewall rules configured (ports 80, 443)
- [ ] Backup storage configured (S3 or local)
- [ ] Monitoring agents installed (ELK/Datadog)

### Code Ready
- [ ] All tests passing (47/47)
- [ ] Code reviewed & approved
- [ ] Security scan clean (0 P0/P1)
- [ ] No hardcoded secrets in code
- [ ] Version tag created: `v2.0.0-prod`
- [ ] Docker image built & pushed to registry
- [ ] Docker image scanned for vulnerabilities

### Team Ready
- [ ] Deployment team assembled
- [ ] On-call engineer designated
- [ ] Incident response plan reviewed
- [ ] Rollback procedure tested
- [ ] Communication plan confirmed
- [ ] User notification prepared

---

## 🔧 STEP-BY-STEP DEPLOYMENT

### STEP 1: Prepare Environment (30 minutes)

```bash
# 1.1 SSH to production server
ssh deploy@showdeal-prod.example.com

# 1.2 Create application directory
sudo mkdir -p /opt/showdeal/{config,uploads,logs,backups}
sudo chown -R deploy:deploy /opt/showdeal

# 1.3 Clone repository
cd /opt/showdeal
git clone https://github.com/cvalderrama126/showdeal.git repo
cd repo
git checkout v2.0.0-prod

# 1.4 Create .env.production (NEVER commit this)
cp .env.example.prod .env.production
# EDIT .env.production with real secrets
nano .env.production
# Verify all CHANGE_ME_* values are replaced

# 1.5 Create .gitignore entry (safety measure)
echo ".env.production" >> .gitignore
```

### STEP 2: Database Setup (20 minutes)

```bash
# 2.1 Start PostgreSQL container
docker-compose -f docker-compose.prod.yml up -d postgres

# 2.2 Wait for database to be ready
sleep 10
docker-compose -f docker-compose.prod.yml exec postgres pg_isready

# 2.3 Run Prisma migrations
docker-compose -f docker-compose.prod.yml exec -T showdeal-api npx prisma migrate deploy

# 2.4 Verify migrations applied
docker-compose -f docker-compose.prod.yml exec postgres psql -U showdeal_user -d showdeal_prod -c "\dt"

# 2.5 Create initial backup
docker-compose -f docker-compose.prod.yml exec postgres pg_dump -U showdeal_user -d showdeal_prod > /opt/showdeal/backups/pre-launch-$(date +%Y%m%d-%H%M%S).sql
```

### STEP 3: Start Application (15 minutes)

```bash
# 3.1 Pull latest Docker image
docker pull showdeal:latest

# 3.2 Start all services
docker-compose -f docker-compose.prod.yml up -d

# 3.3 Wait for services to be healthy
sleep 30
docker-compose -f docker-compose.prod.yml ps

# 3.4 Verify logs (check for errors)
docker-compose -f docker-compose.prod.yml logs --tail=50 showdeal-api

# 3.5 Run health check
curl http://localhost:3001/health

# Expected response:
# {
#   "ok": true,
#   "status": "ready",
#   "database": "connected",
#   "redis": "connected"
# }
```

### STEP 4: Configure Reverse Proxy (10 minutes)

```bash
# 4.1 Install nginx (if not already done)
sudo apt-get install -y nginx

# 4.2 Create nginx config
sudo tee /etc/nginx/sites-available/showdeal > /dev/null <<EOF
server {
    listen 80;
    server_name showdeal.com www.showdeal.com;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name showdeal.com www.showdeal.com;

    ssl_certificate /etc/letsencrypt/live/showdeal.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/showdeal.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    client_max_body_size 10M;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

# 4.3 Enable nginx config
sudo ln -sf /etc/nginx/sites-available/showdeal /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# 4.4 Test nginx config
sudo nginx -t

# 4.5 Start nginx
sudo systemctl restart nginx
```

### STEP 5: Setup Monitoring (15 minutes)

```bash
# 5.1 Verify container logging
docker-compose -f docker-compose.prod.yml logs --follow showdeal-api &
sleep 5

# 5.2 Setup backup cron job
(crontab -l 2>/dev/null; echo "0 2 * * * cd /opt/showdeal/repo && ./scripts/backup-database.sh") | crontab -

# 5.3 Verify monitoring agent connected
# Check Datadog/ELK dashboard for metrics

# 5.4 Test alerting
# Trigger test alert to confirm notifications
```

### STEP 6: Smoke Tests (10 minutes)

```bash
# 6.1 Test API health endpoint
curl -X GET https://showdeal.com/health

# Expected: { "ok": true, "status": "ready" }

# 6.2 Test database connectivity
curl -X GET https://showdeal.com/api/r_user/count

# Expected: { "ok": true, "count": N }

# 6.3 Test authentication
curl -X POST https://showdeal.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"user_1":"admin","password":"testpass123"}'

# 6.4 Monitor error logs
docker-compose -f docker-compose.prod.yml logs --tail=100 showdeal-api | grep -i error

# 6.5 Check resource usage
docker stats --no-stream
```

### STEP 7: Final Validation (5 minutes)

```bash
# 7.1 Run production validation script
node /opt/showdeal/repo/scripts/validate-production.js

# 7.2 Verify all services are running
docker-compose -f docker-compose.prod.yml ps

# Expected: All services showing "Up"

# 7.3 Check database backup
ls -lh /opt/showdeal/backups/

# 7.4 Confirm SSL/TLS working
curl -I https://showdeal.com

# Expected: HTTP/2 200, ssl-certificate valid
```

---

## ✅ DEPLOYMENT COMPLETE

Once all steps pass, deployment is successful. Monitor the following for 24 hours:

- **Error logs** - Check for any exceptions
- **Performance metrics** - Response times < 500ms
- **User activity** - Confirm real users can login & bid
- **Database size** - Monitor for unexpected growth
- **Backup status** - Verify automatic backups running

---

## 📊 DEPLOYMENT TIMELINE

| Step | Duration | Status |
|------|----------|--------|
| 1. Prepare Environment | 30 min | ⏳ |
| 2. Database Setup | 20 min | ⏳ |
| 3. Start Application | 15 min | ⏳ |
| 4. Reverse Proxy | 10 min | ⏳ |
| 5. Monitoring | 15 min | ⏳ |
| 6. Smoke Tests | 10 min | ⏳ |
| 7. Validation | 5 min | ⏳ |
| **TOTAL** | **~105 min** | |

---

## 🚨 TROUBLESHOOTING

### Container won't start
```bash
docker-compose -f docker-compose.prod.yml logs showdeal-api
# Fix: Check .env.production values
```

### Database connection failed
```bash
docker-compose -f docker-compose.prod.yml exec postgres psql -U showdeal_user -c "\l"
# Fix: Verify DATABASE_URL in .env.production
```

### Nginx reverse proxy not working
```bash
sudo nginx -t
sudo systemctl restart nginx
# Fix: Check nginx logs in /var/log/nginx/
```

### SSL/TLS certificate expired
```bash
sudo certbot renew
sudo systemctl restart nginx
# Setup: Auto-renewal with cron
```

---

## 📞 SUPPORT

For deployment issues:
- Check logs: `docker-compose -f docker-compose.prod.yml logs`
- Run validation: `node scripts/validate-production.js`
- See rollback procedure: [rollback-procedure.md](./rollback-procedure.md)

---

**Deployment Guide v1.0** | Last Updated: Junio 2026
