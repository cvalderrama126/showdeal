# 🔄 FASE 3: Staging Deploy & E2E Testing Plan

**Phase**: Martes (Tuesday)  
**Duration**: Full day  
**Goal**: Validate application in production-like environment with complete E2E testing  
**Success Criteria**: 10+ critical flows pass + Performance <500ms  

---

## 📋 FASE 3 SCHEDULE

| Time | Activity | Duration | Owner |
|------|----------|----------|-------|
| **09:00** | Staging setup & verification | 30 min | DevOps |
| **09:30** | Deploy staging build | 45 min | DevOps |
| **10:15** | Database migration & seeding | 30 min | DevOps |
| **10:45** | Health check & smoke tests | 20 min | QA |
| **11:05** | E2E critical flows tests | 120 min | QA |
| **13:05** | LUNCH BREAK | 60 min | All |
| **14:05** | Performance testing (100 concurrent) | 45 min | QA |
| **14:50** | Security scanning (OWASP ZAP) | 45 min | QA |
| **15:35** | Results analysis & fix any gaps | 45 min | Tech Lead |
| **16:20** | Staging validation sign-off | 40 min | Product |
| **17:00** | End of day standup | - | All |

---

## 🎯 STAGING ENVIRONMENT SETUP

### Infrastructure Requirements

```yaml
Staging Database:
  Type: PostgreSQL 14+
  Size: Same as production (5GB+)
  Backup: Enabled
  Data: Fresh schema + test fixtures

Staging Redis:
  Type: Redis 7+
  Memory: 256MB minimum
  Persistence: Enabled
  TTL: Same as production

Staging API:
  CPU: 2 cores
  Memory: 1GB
  Disk: 20GB
  Network: Separate from production
  Domain: staging.showdeal.com or localhost:3001
  TLS: Self-signed OK (for testing)

Load Testing:
  Concurrency: 100 concurrent users
  Duration: 5 minutes
  Ramp-up: Linear over 30 seconds
  Think time: 2 seconds between requests
```

### Docker Compose for Staging

```bash
# Use docker-compose.prod.yml with staging overrides
docker-compose -f docker-compose.prod.yml \
  -f docker-compose.staging.yml \
  up -d

# Environment overrides (in docker-compose.staging.yml):
services:
  showdeal-api:
    environment:
      NODE_ENV: staging
      LOG_LEVEL: debug
      DATABASE_URL: postgresql://showdeal_test:testpass@postgres:5432/showdeal_staging
      RATE_LIMIT_ENABLED: "true"
      ENABLE_DEBUG_ERRORS: "1"
```

---

## 🧪 E2E CRITICAL FLOWS TESTING

### Test Flow 1: User Registration & First Login

```gherkin
Feature: User Registration & First Login
  As a new user
  I want to register and set up OTP
  So that I can securely access the platform

  Scenario: Complete first login flow
    Given I am on the login page
    When I enter admin credentials
    Then I see the OTP setup screen
    And I can scan QR code with authenticator
    And I enter the OTP code
    Then I am logged in
    And I can access the dashboard
    
  Acceptance Criteria:
    ✓ OTP QR code displays correctly
    ✓ QR code scannable by Authenticator
    ✓ OTP verification works with totp
    ✓ Session persists across page reload
    ✓ Response time < 200ms
```

### Test Flow 2: Auction Browsing & Filtering

```gherkin
Feature: Browse Auctions
  Scenario: Filter auctions by type and status
    Given I am logged in
    When I navigate to Auctions
    Then I see list of active auctions
    And I can filter by auction type
    And I can sort by highest bid
    And pagination works correctly
    
  Acceptance Criteria:
    ✓ List loads < 500ms
    ✓ Filters return correct results
    ✓ Pagination navigation works
    ✓ No data leakage across companies
```

### Test Flow 3: Bidding Process

```gherkin
Feature: Place Bids
  Scenario: User places bid on auction
    Given I am viewing an active auction
    When I enter a bid amount
    And I click Submit Bid
    Then the bid is recorded
    And I see confirmation message
    And bid appears in history
    
  Acceptance Criteria:
    ✓ Bid validation works
    ✓ Bid amount must be > 0
    ✓ Cannot bid after event ends
    ✓ Sealed auctions: 1 bid per user
    ✓ Bid persists in database
    ✓ Response time < 300ms
```

### Test Flow 4: File Upload

```gherkin
Feature: Upload Documents
  Scenario: Upload auction document
    Given I am on auction detail page
    When I click Upload File
    And I select a PDF file (< 10MB)
    And I click Confirm
    Then file is uploaded
    And file appears in attachments list
    And I can download it
    
  Acceptance Criteria:
    ✓ File size validation works
    ✓ File type validation works
    ✓ Progress indicator shows
    ✓ File encrypts on server
    ✓ Can download with ownership check
    ✓ Response time < 500ms
```

### Test Flow 5: Round1 Bulk Upload

```gherkin
Feature: Round1 Excel Upload
  Scenario: Upload Excel with multiple bids
    Given I am admin for an event
    When I click Download Template
    And I fill in 50 auctions
    And I upload the file
    Then all bids are processed
    And summary shows created/failed counts
    
  Acceptance Criteria:
    ✓ Template downloads correctly
    ✓ Column headers recognized
    ✓ Plate validation works
    ✓ Duplicate detection works
    ✓ Batch insert performs well
    ✓ Response time < 2 seconds
```

### Test Flow 6: Permission Enforcement

```gherkin
Feature: RBAC Permission Checks
  Scenario: Restrict unauthorized access
    Given I am a read-only user
    When I try to create an auction
    Then I get 403 Forbidden
    And no record is created
    
  Acceptance Criteria:
    ✓ Module access enforced
    ✓ Action permission enforced
    ✓ Company isolation enforced
    ✓ 403 response codes correct
```

### Test Flow 7: Auction Resolution

```gherkin
Feature: Resolve Auction
  Scenario: Declare winner
    Given auction has ended
    When I click Resolve
    And I confirm winner selection
    Then auction marked as resolved
    And winner notified
    And auction removed from active list
```

### Test Flow 8: Rate Limiting

```gherkin
Feature: Rate Limiting
  Scenario: Block excessive requests
    Given I make 6 login attempts in 1 minute
    When I submit the 6th attempt
    Then I get 429 Too Many Requests
    And I must wait before retrying
```

### Test Flow 9: Concurrent Bidding

```gherkin
Feature: Handle Concurrent Bids
  Scenario: Multiple users bid simultaneously
    Given 10 users view same auction
    When all bid at same time
    Then bids are ordered by amount
    And highest bidder is clear
    And no race conditions occur
```

### Test Flow 10: Data Integrity

```gherkin
Feature: Data Persistence
  Scenario: Verify data after server restart
    Given I placed a bid
    When server restarts
    And I log back in
    Then my bid still exists
    And bid history is accurate
    And no data corruption
```

---

## 📊 PERFORMANCE BENCHMARKS

### Target Metrics

| Endpoint | Target | Acceptance | Alert |
|----------|--------|-----------|-------|
| GET /health | <100ms | <200ms | >300ms |
| GET /api/r_auction | <200ms | <500ms | >750ms |
| GET /api/r_bid | <200ms | <500ms | >750ms |
| POST /api/r_auction/:id/bid | <300ms | <500ms | >750ms |
| POST /api/r_attach | <500ms | <1000ms | >1500ms |
| POST /r_auction/round1/upload | <2000ms | <5000ms | >8000ms |

### Load Testing Scenario

```
Concurrent Users: 100
Ramp-up: 30 seconds (1-2 users/sec)
Duration: 5 minutes per endpoint
Think Time: 2-3 seconds between requests

Expected Results:
✓ 99th percentile: < 500ms
✓ Error rate: < 0.1%
✓ No memory leaks
✓ CPU usage: < 80%
✓ Database connections: < 50
```

---

## 🔒 SECURITY SCANNING

### OWASP ZAP Scan Plan

```bash
# Run automated security scan
zaproxy \
  -cmd \
  -quickurl https://staging.showdeal.com \
  -report /reports/owasp-zap-report.html

# Manual checks:
- SQL Injection: Try ' OR '1'='1 on search
- XSS: Try <img src=x onerror=alert(1)> in forms
- CSRF: Verify tokens on state-changing requests
- IDOR: Try accessing other user's resources
- Authentication: Try expired token
- Rate limiting: Send 100 requests in 10 seconds
```

### Security Validation Checklist

- [ ] No SQL injection vulnerabilities found
- [ ] No XSS vulnerabilities found
- [ ] CSRF tokens present and validated
- [ ] IDOR checks prevent unauthorized access
- [ ] Authentication enforced on protected endpoints
- [ ] Rate limiting blocks excessive requests
- [ ] No sensitive data in responses
- [ ] HTTPS enforced (no mixed content)
- [ ] Security headers present
- [ ] No debug information exposed

---

## ✅ STAGING VALIDATION CHECKLIST

### Infrastructure

- [ ] Staging database running & accessible
- [ ] Staging Redis running & accessible
- [ ] Staging API container running
- [ ] Health check endpoint responding
- [ ] Database migrations completed
- [ ] Test fixtures loaded
- [ ] Backup configured & tested
- [ ] Monitoring enabled
- [ ] Logging working
- [ ] Network isolation verified

### Application

- [ ] API server responding on correct port
- [ ] Database connectivity verified
- [ ] Redis cache working
- [ ] File uploads working
- [ ] File downloads working
- [ ] Email notifications working (or stubbed)
- [ ] Rate limiting enforced
- [ ] RBAC working correctly
- [ ] Ownership checks enforced
- [ ] Audit logging active

### E2E Tests

- [ ] Test 1: First Login & OTP Setup ✓
- [ ] Test 2: Auction Browsing ✓
- [ ] Test 3: Bidding Process ✓
- [ ] Test 4: File Uploads ✓
- [ ] Test 5: Round1 Bulk Upload ✓
- [ ] Test 6: Permission Enforcement ✓
- [ ] Test 7: Auction Resolution ✓
- [ ] Test 8: Rate Limiting ✓
- [ ] Test 9: Concurrent Bidding ✓
- [ ] Test 10: Data Integrity ✓

### Performance

- [ ] GET /health < 200ms ✓
- [ ] GET /api/r_auction < 500ms ✓
- [ ] GET /api/r_bid < 500ms ✓
- [ ] POST /bid < 500ms ✓
- [ ] POST /attach < 1000ms ✓
- [ ] 100 concurrent users: <1% errors ✓
- [ ] 99th percentile latency < 500ms ✓
- [ ] No memory leaks after 1 hour ✓

### Security

- [ ] OWASP ZAP scan: 0 high-risk findings
- [ ] No SQL injection vulnerabilities
- [ ] No XSS vulnerabilities
- [ ] CSRF tokens validated
- [ ] IDOR checks working
- [ ] Rate limiting enforced
- [ ] Authentication required
- [ ] Authorization enforced
- [ ] Encryption working
- [ ] Audit logging active

### Data

- [ ] Data persists after restart
- [ ] No data corruption
- [ ] Backups working
- [ ] Restore tested
- [ ] No sensitive data in logs
- [ ] No hardcoded secrets

---

## 📈 RESULTS REPORTING

### Daily Standup Report

```markdown
## Staging Validation - Daily Standup

**Date**: June 18, 2026 (Tuesday)
**Status**: ON TRACK | AT RISK | BLOCKED

### Completed Today
- ✅ Infrastructure provisioned
- ✅ Application deployed to staging
- ✅ E2E tests 10/10 passing
- ✅ Performance tests completed

### In Progress
- 🟡 Security scanning (ongoing)
- 🟡 Load testing analysis

### Blocked
- 🔴 None

### Metrics
- Test Pass Rate: 100%
- Performance: 95th percentile < 400ms
- Error Rate: 0.05%
- Uptime: 99.9%

### Next Steps
1. Complete ZAP security scan
2. Analyze load test results
3. Sign off on staging validation
4. Prepare for FASE 4 production setup
```

---

## 🎯 SUCCESS CRITERIA FOR FASE 3

**All of the following must be TRUE:**

- [x] Staging infrastructure deployed
- [x] 10+ critical E2E flows pass
- [x] Performance benchmarks met (<500ms 99th percentile)
- [x] OWASP ZAP scan: 0 high/critical findings
- [x] Load test: 100 concurrent users, <1% errors
- [x] Data integrity verified
- [x] Security validations passed
- [x] Product team sign-off obtained
- [x] Zero critical bugs blocking production

---

## 📞 ESCALATION CRITERIA

If ANY of the following occur, escalate immediately:

- ❌ E2E test failure on critical flow
- ❌ Performance degradation (>1000ms response time)
- ❌ Security vulnerability found
- ❌ Data corruption detected
- ❌ Memory leak or crash observed
- ❌ Cannot deploy or rollback successfully

---

## 🔄 ROLLBACK PLAN

If critical issues found during staging:

```bash
# 1. Stop staging deployment
docker-compose -f docker-compose.staging.yml down

# 2. Restore previous database backup
./scripts/restore-database.sh /backups/staging-backup.sql.gz

# 3. Deploy previous stable version
docker-compose -f docker-compose.staging.yml up -d

# 4. Re-run E2E tests
npm run test:e2e:critical-flows
```

---

**FASE 3 Status**: READY TO EXECUTE  
**Next Phase**: FASE 4 (Miércoles) - Production Setup & Monitoring

---

*Prepared for Tuesday full-day staging validation and E2E testing.*
