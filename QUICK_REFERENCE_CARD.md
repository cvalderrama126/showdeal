# ⚡ QUICK REFERENCE - ShowDeal Operations Cheat Sheet

## 🚀 DEPLOY STAGING (Automated)
```bash
cd App
node scripts/deploy-staging.js
# 5 minutes - everything automated
```

## 📊 SYSTEM STATUS
```bash
# All at once
docker ps && docker stats --no-stream && curl http://localhost:3001/health
```

## 🔧 RESTART SERVICE
```bash
# API only
docker-compose restart api

# Everything
docker-compose down && docker-compose up -d
```

## 🗄️ DATABASE
```bash
# Status
npx prisma migrate status

# Backup
./scripts/backup-database.sh

# Restore
./scripts/restore-database.sh

# Data access
npx prisma studio
```

## 🧪 TESTS
```bash
# All
npm test

# Security only
npm run test:security

# API tests
npm run test:api

# Performance
npm run test:performance
```

## 📝 LOGS
```bash
# API (last 50 lines, follow)
docker-compose logs -f api --tail=50

# Database
docker-compose logs -f postgres

# All services
docker-compose logs -f
```

## 🆘 TROUBLESHOOTING

| Problem | Solution |
|---------|----------|
| API not responding | `docker-compose restart api` |
| DB connection error | `docker-compose restart postgres` |
| Port in use | `lsof -i :3001` then `kill -9 <PID>` |
| Memory full | `docker system prune -a` |
| Tests fail | `npm test -- --clearCache` |
| Build fails | `docker build -t showdeal:staging --no-cache .` |

## 🔐 SECURITY
```bash
# Scan for secrets
grep -r "password\|secret" src/ | grep -v node_modules

# Check dependencies
npm audit

# Run security tests
npm run test:security

# Validate JWT
curl -I http://localhost:3001/api/r_user \
  -H "Authorization: Bearer invalid" # should 401
```

## 📊 PERFORMANCE
```bash
# Response time
curl -w "Time: %{time_total}s\n" http://localhost:3001/health

# Resource usage
docker stats

# Benchmark tests
npm run test:performance
```

## 💾 MAINTENANCE
```bash
# Update dependencies
npm update

# Audit vulnerabilities
npm audit fix

# Format code
npm run lint:fix

# Database optimize
npx prisma db push
```

## 🚨 INCIDENTS

### API Down
```bash
# Check
docker-compose ps

# Fix
docker-compose restart api
curl http://localhost:3001/health
```

### DB Down
```bash
# Check
docker ps | grep postgres

# Fix
docker-compose restart postgres
docker-compose exec postgres psql -U showdeal_user -d showdeal_prod -c "SELECT 1"
```

### High Latency
```bash
# Check response time
npm run test:performance

# Check load
docker stats

# Restart
docker-compose restart api
```

---

## Key Commands

| Operation | Command | Time |
|-----------|---------|------|
| Deploy | `node scripts/deploy-staging.js` | 5 min |
| Test | `npm test` | 15 min |
| Check Health | `curl http://localhost:3001/health` | 1 sec |
| View Logs | `docker-compose logs -f api` | Real-time |
| Restart | `docker-compose restart api` | 10 sec |
| Backup DB | `./scripts/backup-database.sh` | 2 min |
| Migrate | `npx prisma migrate deploy` | 1 min |

---

**Print this page for on-call reference!**

*For detailed procedures, see OPERATIONS_RUNBOOK.md*
