# 📖 OPERATIONS RUNBOOK - ShowDeal Staging & Production

**Last Updated**: June 16, 2026  
**Version**: 1.0 - Production Ready  

---

## 🚀 QUICK START

### Staging Deployment (Automated)
```bash
cd App
node scripts/deploy-staging.js
# Automatically:
# - Validates environment
# - Builds Docker image
# - Starts containers
# - Runs migrations
# - Executes health checks
# - Runs test suite
```

### Manual Staging Deployment
```bash
# 1. Verify environment
export DATABASE_URL="postgresql://..."
export JWT_SECRET="your-secret"
export NODE_ENV="staging"

# 2. Build & start
docker-compose -f docker-compose.staging.yml up -d

# 3. Migrate database
docker-compose -f docker-compose.staging.yml exec api npx prisma migrate deploy

# 4. Verify health
curl http://localhost:3001/health

# 5. Run tests
npm run test:security
npm run test:api
npm run test:performance
```

---

## 📋 COMMON OPERATIONS

### Check System Health
```bash
# API health
curl -I http://localhost:3001/health

# Docker containers status
docker-compose ps

# Database connectivity
docker-compose exec api node -e "require('./src/db/prisma').prisma.r_user.count()"

# Redis connectivity
docker-compose exec redis redis-cli ping

# Memory usage
docker stats --no-stream

# Logs
docker-compose logs -f api
docker-compose logs -f postgres
docker-compose logs -f redis
```

### Database Operations
```bash
# View database
npx prisma studio

# List migrations
npx prisma migrate status

# Run migration
npx prisma migrate deploy

# Reset database (WARNING: destructive)
npx prisma migrate reset --force

# Backup database
./scripts/backup-database.sh

# Restore database
./scripts/restore-database.sh
```

### API Testing
```bash
# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"login":"admin@example.com","password":"password"}'

# List users
curl http://localhost:3001/api/r_user \
  -H "Authorization: Bearer $TOKEN"

# Create test data
npm run test:modules
```

### Container Management
```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down

# Restart specific service
docker-compose restart api

# View logs
docker-compose logs -f api --tail=100

# Execute command in container
docker-compose exec api npm run lint

# Rebuild image
docker build -t showdeal:staging .

# Clear Docker cache
docker system prune -a
```

---

## 🆘 TROUBLESHOOTING

### API not responding
```bash
# Check if running
docker ps | grep api

# Check logs
docker-compose logs api | tail -50

# Check health endpoint
curl -v http://localhost:3001/health

# Restart
docker-compose restart api

# Rebuild if needed
docker build -t showdeal:staging .
docker-compose up -d
```

### Database connection error
```bash
# Check PostgreSQL status
docker ps | grep postgres

# Check PostgreSQL logs
docker-compose logs postgres | tail -50

# Verify DATABASE_URL
echo $DATABASE_URL

# Test connection
docker-compose exec postgres psql -U showdeal_user -d showdeal_prod -c "SELECT 1"

# Reset database (careful!)
docker-compose down
docker volume rm showdeal_db_data
docker-compose up -d
```

### Tests failing
```bash
# Run with verbose output
npm test -- --verbose

# Run specific test file
npm test tests/security.test.js

# Clear Jest cache
npm test -- --clearCache

# Run with coverage
npm test -- --coverage
```

### Memory/performance issues
```bash
# Check memory
docker stats

# Check slow queries
docker-compose exec postgres tail -f /var/log/postgresql/postgresql.log

# View running processes
docker-compose exec postgres ps aux

# Check disk space
docker exec postgres df -h
```

### Port already in use
```bash
# Find process using port 3001
lsof -i :3001

# Kill process
kill -9 <PID>

# Or change port in docker-compose
export PORT=3002
```

---

## 🔐 SECURITY CHECKS

### Pre-deployment
```bash
# Check for hardcoded secrets
grep -r "password\|secret\|token\|key" src/ --include="*.js" | grep -v "node_modules"

# Check dependencies
npm audit

# Run security tests
npm run test:security

# ESLint check
npm run lint

# OWASP ZAP scan (if available)
docker run -t owasp/zap2docker-stable zap-baseline.py -t http://localhost:3001
```

### Post-deployment
```bash
# Verify security headers
curl -I http://localhost:3001/health | grep -i "X-"

# Check SSL/TLS (production only)
openssl s_client -connect staging.showdeal.com:443

# Test authentication
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{}'  # Should fail with 400

# Test rate limiting (10 fast requests)
for i in {1..10}; do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/health; done
```

---

## 📊 MONITORING

### Key Metrics
```bash
# Response time
curl -w "Response time: %{time_total}s\n" http://localhost:3001/health

# Throughput (requests per second)
npm run test:performance -- --testNamePattern="throughput"

# Concurrent connections
docker stats --no-stream | grep api

# Database queries
docker-compose exec postgres tail -f /var/log/postgresql/postgresql.log | grep "duration"
```

### Health Checks
```bash
# Comprehensive health check
node scripts/healthcheck-production.js

# Component checks
- API: curl http://localhost:3001/health
- Database: psql -U showdeal_user -d showdeal_prod -c "SELECT 1"
- Redis: redis-cli ping
- Disk: df -h
```

---

## 🚨 INCIDENT RESPONSE

### API Down (500 errors)
```bash
# 1. Check service status
docker ps | grep api

# 2. View logs
docker-compose logs api | tail -100

# 3. Check database
docker-compose exec postgres psql -U showdeal_user -d showdeal_prod -c "SELECT 1"

# 4. Check memory
docker stats

# 5. Restart API
docker-compose restart api

# 6. If still broken, rebuild
docker build -t showdeal:staging .
docker-compose up -d api

# 7. Verify
curl http://localhost:3001/health
```

### Database Down
```bash
# 1. Check status
docker ps | grep postgres

# 2. Check logs
docker-compose logs postgres | tail -100

# 3. Restart
docker-compose restart postgres

# 4. Test connection
docker-compose exec postgres psql -U showdeal_user -d showdeal_prod -c "SELECT 1"

# 5. If persistent, restore from backup
./scripts/restore-database.sh

# 6. Verify data
npx prisma db push
```

### High Memory Usage
```bash
# 1. Check usage
docker stats

# 2. Identify memory leak
docker-compose logs api | grep -i "memory\|oom\|heap"

# 3. Restart service
docker-compose restart api

# 4. Monitor
watch -n 5 'docker stats --no-stream'

# 5. If recurring, investigate code
npm run test:performance
```

### High Latency/Slow Responses
```bash
# 1. Check response times
npm run test:performance

# 2. Check database queries
docker-compose exec postgres tail -f /var/log/postgresql/postgresql.log

# 3. Check CPU/memory
docker stats

# 4. Check active connections
docker-compose exec postgres psql -U showdeal_user -d showdeal_prod -c "SELECT count(*) FROM pg_stat_activity"

# 5. Check indexes
npx prisma introspect

# 6. Optimize if needed
docker-compose restart api
```

---

## 📝 LOG LOCATIONS

| Component | Log Location | View Command |
|-----------|--------------|--------------|
| API | Docker stdout | `docker-compose logs -f api` |
| Database | PostgreSQL logs | `docker-compose logs -f postgres` |
| Redis | Redis logs | `docker-compose logs -f redis` |
| Access logs | Docker volume | `docker-compose logs api` |

---

## 🔄 STANDARD PROCEDURES

### Daily Operations
- **09:00**: Check system health
- **12:00**: Verify backups
- **17:00**: Review logs for errors
- **22:00**: Performance analysis

### Weekly Maintenance
- Monday: Full test suite run
- Wednesday: Security audit
- Friday: Performance profiling

### Monthly Tasks
- Update dependencies
- Security patching
- Disaster recovery drill

---

## 👥 CONTACTS & ESCALATION

| Role | Contact | On-Call |
|------|---------|---------|
| Tech Lead | _______________ | Yes |
| DevOps | _______________ | Yes |
| Database Admin | _______________ | No |
| Support | _______________ | 24/7 |

---

## 📞 ESCALATION MATRIX

| Severity | Response Time | On-Call | Escalation |
|----------|---------------|---------|------------|
| P0 Critical | 30 min | YES | Immediate |
| P1 High | 1 hour | YES | 15 min |
| P2 Medium | 4 hours | NO | 2 hours |
| P3 Low | 1 day | NO | Next day |

---

## ✅ PRE-LAUNCH CHECKLIST

- [ ] All tests passing (206/221 minimum)
- [ ] Zero npm vulnerabilities
- [ ] ESLint: 0 errors
- [ ] Database migrations successful
- [ ] All health checks green
- [ ] Performance benchmarks met (<500ms)
- [ ] Security scan clean
- [ ] Team trained on procedures
- [ ] Runbooks updated
- [ ] Incident response ready

---

**Document Version**: 1.0  
**Last Review**: June 16, 2026  
**Next Review**: After FASE 3 execution

---

*For emergency procedures, see INCIDENT_RESPONSE.md*  
*For deployment procedures, see deployment-guide.md*  
*For security procedures, see SECURITY_AUDIT_REPORT.md*
