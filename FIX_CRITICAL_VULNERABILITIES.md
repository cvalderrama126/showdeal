# 🔧 CÓDIGO LISTO PARA FIX - VULNERABILIDADES CRÍTICAS

> **IMPORTANTE:** Copia y pega estos códigos en los archivos correspondientes

---

## FIX #1: CORS WHITELIST (src/app.js)

**REEMPLAZA LÍNEA 13 DE SRC/APP.JS:**

```javascript
// ❌ VIEJO (inseguro)
// app.use(cors());

// ✅ NUEVO (seguro)
const allowedOrigins = [
  "http://localhost:3000",      // Dev frontend
  "http://localhost:3001",      // Dev API
  "https://showdeal.com",       // Prod
  "https://www.showdeal.com",   // Prod www
  "https://app.showdeal.com",   // Prod app
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);  // Mobile/curl
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS not allowed: ${origin}`));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 200,
  maxAge: 86400,
}));
```

---

## FIX #2: JWT VALIDACIÓN DE ALGORITMO (src/auth/auth.middleware.js)

**REEMPLAZA FUNCIÓN `requireAuth` COMPLETA:**

```javascript
function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    
    // Validar formato Bearer
    if (!header.startsWith("Bearer ")) {
      return res.status(401).json({ 
        ok: false, 
        error: "Missing Bearer token" 
      });
    }
    
    const token = header.substring(7);
    if (!token) {
      return res.status(401).json({ 
        ok: false, 
        error: "Missing token" 
      });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ 
        ok: false, 
        error: "JWT_SECRET missing" 
      });
    }

    // ✅ IMPORTANTE: Especificar algoritmo
    req.auth = jwt.verify(token, secret, {
      algorithms: ["HS256"],  // SOLO HS256 permitido
      issuer: undefined,      // Ajustar si usas issuer
    });
    
    // Validar estructura
    if (!req.auth.sub) {
      return res.status(401).json({ 
        ok: false, 
        error: "Invalid token: missing sub" 
      });
    }
    
    return next();
  } catch (e) {
    const status = e.name === "TokenExpiredError" ? 401 : 401;
    return res.status(status).json({ 
      ok: false, 
      error: e.name === "JsonWebTokenError" ? "Invalid token" : "Token verification failed"
    });
  }
}
```

---

## FIX #3: VALIDACIÓN ZOD LOGIN (src/auth/auth.routes.js)

**REEMPLAZA LÍNEA 12-21 (POST /login):**

```javascript
const { z } = require("zod");

// Agregar al inicio del archivo
const loginSchema = z.object({
  user: z.string()
    .trim()
    .min(1, "Username required")
    .max(100, "Username too long"),
  password: z.string()
    .min(1, "Password required")
    .max(500, "Password too long"),
});

// REEMPLAZAR POST /login
router.post("/login", async (req, res, next) => {
  try {
    // ✅ VALIDAR ANTES
    const validated = loginSchema.parse(req.body);
    const result = await login(validated);
    return respondWithResult(res, result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        issues: err.issues.map(i => ({ path: i.path, message: i.message }))
      });
    }
    return next(err);
  }
});
```

---

## FIX #4: VALIDACIÓN CRUD ENDPOINTS

**ARCHIVO NUEVO: src/schemas/validation.js**

```javascript
// src/schemas/validation.js
const { z } = require("zod");

const userSchema = z.object({
  id_company: z.union([z.string(), z.number()])
    .transform(Number)
    .refine(n => n > 0, "Invalid company"),
  id_role: z.union([z.string(), z.number()])
    .transform(Number)
    .refine(n => n > 0, "Invalid role"),
  uin: z.string().trim().min(1).max(50),
  user: z.string().trim().min(3).max(100),
  user_1: z.string().trim().min(3).max(100).optional(),
  name: z.string().trim().min(1).max(255),
  is_active: z.boolean().default(true),
  password: z.string().min(8).max(128).optional(),
  additional: z.record(z.any()).nullable().optional(),
});

const assetSchema = z.object({
  uin: z.string().trim().min(1).max(255),
  tp_asset: z.string().trim().min(1).max(100),
  status: z.string().trim().min(1).max(50),
  book_value: z.number().min(0).max(999999999.99),
  appraised_value: z.number().min(0).max(999999999.99),
  expected_value: z.number().min(0).max(999999999.99),
  reserve_price: z.number().min(0).max(999999999.99),
  starting_bid: z.number().min(0).max(999999999.99),
  location_city: z.string().max(255).optional(),
  location_address: z.string().max(255).optional(),
  additional: z.record(z.any()).nullable().optional(),
});

const accessSchema = z.object({
  id_module: z.union([z.string(), z.number()])
    .transform(Number)
    .refine(n => n > 0),
  id_role: z.union([z.string(), z.number()])
    .transform(Number)
    .refine(n => n > 0),
  is_insert: z.boolean().default(false),
  is_update: z.boolean().default(false),
  is_delete: z.boolean().default(false),
  additional: z.record(z.any()).nullable().optional(),
});

module.exports = {
  userSchema,
  assetSchema,
  accessSchema,
};
```

**MODIFICAR: src/routes/crud.factory.js**

Reemplaza la función `createCrudRouter` agregando validación:

```javascript
function createCrudRouter({
  model,
  idField,
  hasIsActive = true,
  softDelete = true,
  requireAuth = null,
  allowCreate = true,
  allowUpdate = true,
  allowDelete = true,
  validationSchema = null,  // ✅ NUEVO PARÁMETRO
}) {
  const r = Router();

  if (requireAuth) r.use(requireAuth);

  // GET endpoints sin cambios...

  if (allowCreate) {
    r.post("/", requireModuleAccess(model, "create"), async (req, res, next) => {
      try {
        let payload = sanitizePayload(model, idField, req.body);
        
        // ✅ VALIDAR CON SCHEMA SI EXISTE
        if (validationSchema) {
          payload = validationSchema.parse(payload);
        }
        
        const created = await prisma[model].create({
          data: payload,
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
  }

  if (allowUpdate) {
    r.put("/:id", requireModuleAccess(model, "update"), async (req, res, next) => {
      try {
        const id = toId(req.params.id);
        let payload = sanitizePayload(model, idField, req.body);
        
        // ✅ VALIDAR CON SCHEMA SI EXISTE
        if (validationSchema) {
          payload = validationSchema.partial().parse(payload);  // partial para updates
        }

        const updated = await prisma[model].update({
          where: { [idField]: id },
          data: payload,
        });

        res.json({ ok: true, data: jsonSafe(updated) });
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
  }

  // DELETE sin cambios...

  return r;
}
```

**USAR EN: src/routes/crud.routes.js**

```javascript
const { userSchema, assetSchema, accessSchema } = require("../schemas/validation");

// ACTUALIZAR:
router.use(
  "/r_user",
  createCrudRouter({
    model: "r_user",
    idField: "id_user",
    requireAuth,
    validationSchema: userSchema,  // ✅ AGREGAR
  })
);

router.use(
  "/r_asset",
  createCrudRouter({
    model: "r_asset",
    idField: "id_asset",
    requireAuth,
    validationSchema: assetSchema,  // ✅ AGREGAR
  })
);

router.use(
  "/r_access",
  createCrudRouter({
    model: "r_access",
    idField: "id_access",
    requireAuth,
    validationSchema: accessSchema,  // ✅ AGREGAR
  })
);
```

---

## FIX #5: RATE LIMIT EN OTP

**ARCHIVO NUEVO: src/middleware/otpLimiter.js**

```javascript
// src/middleware/otpLimiter.js
const rateLimit = require("express-rate-limit");

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutos
  max: 5,                     // Máximo 5 intentos
  message: {
    ok: false,
    error: "TOO_MANY_OTP_ATTEMPTS",
    retryAfter: "15 minutes"
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skip: (req) => !req.body?.challengeToken,
});

module.exports = { otpLimiter };
```

**MODIFICAR: src/auth/auth.routes.js**

```javascript
const { otpLimiter } = require("../middleware/otpLimiter");

// Agregar limitador al endpoint OTP
router.post("/otp/verify", otpLimiter, async (req, res, next) => {
  try {
    const { challengeToken, otp } = req.body || {};
    const result = await verifyOtp({ challengeToken, otp });
    return respondWithResult(res, result);
  } catch (err) {
    return next(err);
  }
});
```

---

## FIX #6: GLOBAL RATE LIMIT (src/app.js)

```javascript
const rateLimit = require("express-rate-limit");

// Agregar después de helmet y cors
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutos
  max: 100,                   // 100 requests por IP
  message: { ok: false, error: "TOO_MANY_REQUESTS" },
  standardHeaders: true,
  legacyHeaders: false,
});

function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ /* config */ }));
  
  // ✅ AGREGAR RATE LIMIT GLOBAL
  app.use(globalLimiter);

  app.use(express.json({ limit: "2mb" }));
  // ... resto
}
```

---

## FIX #7: FILE VALIDATION (src/attachments/attachment.service.js)

**NECESITA npm install file-type**

```bash
npm install file-type
```

**REEMPLAZAR función buildFilePayload:**

```javascript
const fileType = require("file-type");

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

const ALLOWED_EXTENSIONS = [
  ".pdf", ".jpg", ".jpeg", ".png", ".gif", 
  ".doc", ".docx", ".xls", ".xlsx"
];

async function buildFilePayload(file) {
  if (!file?.buffer) return null;

  const content = Buffer.isBuffer(file.buffer) ? file.buffer : Buffer.from(file.buffer);
  
  // ✅ VALIDAR ARCHIVO
  const detected = await fileType.fromBuffer(content);
  
  if (!detected || !ALLOWED_MIME_TYPES.includes(detected.mime)) {
    const error = new Error(`INVALID_FILE_TYPE - ${detected?.mime || 'unknown'} not allowed`);
    error.status = 400;
    throw error;
  }

  const ext = require("path").extname(file.originalname || "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    const error = new Error(`INVALID_FILE_EXTENSION - ${ext} not allowed`);
    error.status = 400;
    throw error;
  }

  const fileHash = crypto.createHash("sha256").update(content).digest("hex");

  return {
    file_name: String(file.originalname || "unknown").trim(),
    mime_type: detected.mime,  // ✅ Del análisis real
    file_size_bytes: BigInt(content.length),
    file_hash: fileHash,
    file_content: content,
  };
}
```

---

## FIX #8: .env EXAMPLE (crear archivo)

**CREAR: App/.env.example**

```env
# API Configuration
PORT=3001
NODE_ENV=production

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/showdeal?schema=public"

# JWT
JWT_SECRET="your-secret-here-min-32-chars"
JWT_EXPIRES_IN="8h"

# JWT Challenge (OTP)
JWT_CHALLENGE_SECRET="your-challenge-secret-here"
JWT_CHALLENGE_EXPIRES_IN="5m"

# File Upload
ATTACH_MAX_SIZE_BYTES=10485760

# Authorization
AUTHZ_REQUIRE_CONFIG=true
```

**ACTUALIZAR: .gitignore**

```
# Agregar estas líneas al final
.env
.env.local
.env.*.local
.env.production
```

---

## ✅ ORDEN DE IMPLEMENTACIÓN

1. **FIX #1 + #8** (CORS + .env) - 30 min
2. **FIX #2** (JWT validation) - 20 min
3. **FIX #3 + #4** (Validación Zod) - 1 hora
4. **FIX #5 + #6** (Rate limiting) - 30 min
5. **FIX #7** (File validation) - 30 min

**TOTAL:** ~3 horas trabajo

---

## 🧪 TESTING CADA FIX

```bash
# Test CORS
curl -H "Origin: http://hacker.com" http://localhost:3001/api/r_user
# Debe retornar error CORS

# Test JWT
curl -H "Authorization: Bearer fake.token.here" http://localhost:3001/api/r_user
# Debe retornar 401

# Test Validation
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"user": "", "password": ""}'
# Debe retornar validation errors

# Test Rate Limit
for i in {1..10}; do
  curl -s http://localhost:3001/api/r_user | head -1
done
# Después de 5+ requests debe retornar rate limit error
```

---

## 🔄 DESPUÉS DE FIX

- [ ] Comitear cambios con `git commit -m "SECURITY: Fix critical vulnerabilities"`
- [ ] Push a rama `security/critical-fixes`
- [ ] Code review por otro developer
- [ ] Testing en staging
- [ ] Deploy a producción
- [ ] Monitorear logs de errores (primeras 2 horas)
- [ ] Verificar que usuarios aún pueden loguear
