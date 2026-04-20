---
name: ShowDeal Developer
description: |
  Agente especializado en desarrollo backend y frontend de ShowDeal.
  Use when: implementar features, corregir bugs, debuggear issues, refactorizar código, agregar endpoints API, modificar módulos CRUD, o trabajar con la arquitectura general del proyecto.
  Expertise: Node.js/Express, PostgreSQL/Prisma, Bootstrap 5, JWT auth, CRUD patterns, BD design, API design.
applyTo: 
  - "src/**"
  - "public/**"
  - "prisma/**"
  - "scripts/**"
---

# ShowDeal Developer Agent

## Stack Tecnológico

- **Backend**: Node.js v18+ + Express.js (MVC pattern)
- **Base de Datos**: PostgreSQL 14+ + Prisma ORM 5+
- **Autenticación**: JWT (HS256) + OTP (TOTP via otplib)
- **Frontend**: HTML5 + JavaScript vanilla + Bootstrap 5 + jQuery
- **Almacenamiento**: Multer (uploads en `/uploads/`)
- **API Response**: JSON + BigInt serialization via jsonSafe()

## Estructura del Proyecto

```
App/
  ├── src/
  │   ├── app.js              # Express app setup
  │   ├── server.js           # Entry point
  │   ├── auth/               # Auth services & routes
  │   │   ├── auth.service.js
  │   │   ├── auth.routes.js
  │   │   ├── auth.middleware.js
  │   ├── routes/             # API routes
  │   │   ├── crud.factory.js         # Generic CRUD factory
  │   │   ├── crud.routes.js          # CRUD router + custom endpoints
  │   │   ├── access.guard.js         # Permission checker
  │   │   ├── health.js               # Health endpoint
  │   │   ├── jsonSafe.js             # BigInt JSON serializer
  │   ├── users/
  │   │   ├── user.routes.js
  │   │   ├── user.service.js
  │   ├── attachments/        # File upload handling
  │   │   ├── attachment.routes.js
  │   │   ├── attachment.service.js
  │   ├── db/
  │   │   └── prisma.js       # Prisma client singleton
  ├── public/                 # Frontend static
  │   ├── home.html           # Main shell
  │   ├── index.html          # Login page
  │   ├── otp.html            # OTP verification
  │   ├── assets/
  │   │   ├── css/            # Bootstrap, custom styles
  │   │   ├── js/             # Utilities (api.js, crud-module.js, etc)
  │   ├── modules/            # CRUD modules (r_*)
  │   │   ├── r_asset/
  │   │   ├── r_auction/
  │   │   ├── r_bid/
  │   │   ├── r_buyer_offer/  # Buyer bidding interface
  │   │   ├── r_user/
  │   │   └── ... (more modules)
  ├── prisma/
  │   └── schema.prisma       # Prisma schema
  ├── scripts/
  │   ├── test-db.js         # DB connectivity test
  │   ├── test-modules.js    # Module endpoint tests
  └── .env                   # Config (PORT, DB_URL, JWT_SECRET, etc)

Docs/
  ├── EntityRelationshipModel.architect
  └── showDeal.sql
```

## Convenciones de Nombres

### Modelos Prisma
- Prefix `r_` + entidad en singular: `r_user`, `r_role`, `r_asset`, `r_auction`, `r_event`, `r_bid`, etc.
- Campos ID: `id_<entity>` (BigInt, @id, autoincrement)
- Campos timestamp: `ins_at` (created), `upd_at` (updated)
- Campos booleano activo: `is_active` (default: true)
- Campos tipo/status: `tp_<field>` o `st_<field>` (String, enum-like)
- Relaciones:FK `id_<entity>` + @relation

### Archivos
- **Services**: `<entity>.service.js` (business logic)
- **Routes**: `<entity>.routes.js` (HTTP endpoints)
- **Módulos frontend**: `public/modules/r_<entity>/r_<entity>.{html,js}`
- **Middleware**: `<feature>.middleware.js`

### API Endpoints
- CRUD: `GET /api/r_<entity>`, `POST /api/r_<entity>`, `PUT /api/r_<entity>/:id`, `DELETE /api/r_<entity>/:id`
- Custom: `/api/r_<entity>/<action>` (e.g., `/api/r_auction/:id/bid`)
- Auth: `/api/auth/<action>` (e.g., `/api/auth/login`, `/api/auth/otp/verify`)

## Patrones de Código

### Service Pattern (Isolate business logic)
```javascript
// src/users/user.service.js
const { prisma } = require("../db/prisma");

async function getAllUsers(filters = {}) {
  return await prisma.r_user.findMany({
    where: { is_active: true, ...filters },
    include: { r_role: { select: { nm_role: true } } },
  });
}

async function createUser(data) {
  return await prisma.r_user.create({ data });
}

module.exports = { getAllUsers, createUser };
```

### Routes Pattern (Thin routing layer)
```javascript
// src/users/user.routes.js
const express = require("express");
const { requireAuth } = require("../auth/auth.middleware");
const userService = require("./user.service");

const router = express.Router();

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const users = await userService.getAllUsers();
    res.json({ ok: true, data: users });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

### CRUD Factory Pattern (Reusable CRUD logic)
```javascript
// src/routes/crud.factory.js
function createCrudRouter({ model, idField, requireAuth, ownershipCheck }) {
  const router = express.Router();
  
  router.get("/", requireAuth, async (req, res, next) => {
    // Generic findMany
  });
  
  router.post("/", requireAuth, async (req, res, next) => {
    // Generic create
  });
  
  // PUT, DELETE...
  
  return router;
}
```

### Frontend Module Pattern
```javascript
// public/modules/r_asset/r_asset.js
async function init_r_asset() {
  const host = document.getElementById("appContent");
  
  // Initialize via crud-module.js helper
  window.SD_CRUD.mount({
    model: "r_asset",
    idField: "id_asset",
    displayFields: ["id_asset", "tp_asset", "starting_bid"],
    filterFields: { tp_asset: "text", is_active: "boolean" },
  });
}
```

### BigInt Handling
```javascript
// Always use jsonSafe() for API responses to serialize BigInt
const { jsonSafe } = require("./routes/jsonSafe");

function toBigIntId(value) {
  const text = String(value || "").trim();
  if (!/^\d+$/.test(text)) return null;
  const id = BigInt(text);
  if (id <= 0n) return null;
  return id;
}

res.json(jsonSafe({ ok: true, userId: user.id_user }));
```

## Autenticación & Autorización

### JWT Token Structure
```json
{
  "sub": "7",              // user ID (string for BigInt compat)
  "roleId": "2",           // role ID
  "isAdmin": true,         // boolean admin flag
  "companyId": "1",        // company ID (0 = no company)
  "iat": 1234567890,
  "exp": 1234571490
}
```

### Auth Middleware
```javascript
// Attach payload to req.auth
router.use(requireAuth); // Validates JWT signature & expiry
// → req.auth = { sub, roleId, isAdmin, companyId }

// Check permission
if (req.auth?.isAdmin !== true) {
  return res.status(403).json({ error: "FORBIDDEN" });
}
```

### OTP Flow
1. **Setup**: POST `/auth/otp/setup/:id_user` → returns {secret, otpauth_url}
2. **Enable**: POST `/auth/otp/enable/:id_user` + {otp: "123456"} → enables OTP
3. **Login**: POST `/auth/login` → if OTP enabled, return challengeToken
4. **Verify**: POST `/auth/otp/verify` + {code: "123456"} → return sessionToken

## Seguridad

### Best Practices
- ✅ **Always validate input**: Use Zod for schema validation
- ✅ **Use BigInt for IDs**: Avoid floating-point precision loss
- ✅ **Check ownership**: Non-admin users can only access own company's assets
- ✅ **Hash passwords**: bcryptjs with salt rounds 10+
- ✅ **Rate limit**: Prevent brute force attacks
- ✅ **CSRF protection**: Use csurf middleware for state-changing requests
- ✅ **SQL Injection**: Prisma parameterizes queries automatically
- ✅ **XSS Prevention**: Use escapeHtml() for user input in frontend

### Permission Checks
```javascript
// Guard at route level
router.put("/:id", requireAuth, async (req, res) => {
  if (req.auth?.isAdmin !== true) {
    // Check company ownership
    const entity = await prisma.r_asset.findUnique({ where: { id_asset } });
    if (String(entity?.id_company) !== String(req.auth?.companyId)) {
      return res.status(403).json({ error: "FORBIDDEN" });
    }
  }
});
```

## Debugging & Testing

### Logs
- Backend: `console.log()` in `src/` (visible in server output)
- Frontend: Browser DevTools Console (F12)
- API Testing: `node scripts/test-modules.js`

### Databases
- Schema inspection: `npx prisma studio` (UI at http://localhost:5555)
- Migrations: `npx prisma migrate dev --name <description>`
- Reset: `npx prisma migrate reset` (⚠️ destructive)

### Common Issues
| Problem | Solution |
|---------|----------|
| "Invalid token" | Token signature mismatch or expired |
| "SEALED_BID_ALREADY_SUBMITTED" | User already submitted offer for sealed auction |
| "EVENT_NOT_ACTIVE" | Event window (start_at ≤ now ≤ end_at) not active |
| "Módulo no carga" | Cache-bust with `?v=${Date.now()}` in href |
| "Empty results" | Check `is_active: true` filter in prisma query |

## Tareas Comunes

### Agregar nuevo CRUD módulo
1. Crear modelo en `prisma/schema.prisma`
2. Run: `npx prisma migrate dev --name add_<entity>`
3. Create: `src/<entity>/<entity>.service.js` (business logic)
4. Create: `src/<entity>/<entity>.routes.js` (HTTP)
5. Wire: Import & mount in `src/app.js` → `app.use("/api/r_<entity>", <entity>Routes)`
6. Frontend: Create `public/modules/r_<entity>/r_<entity>.{html,js}`
7. Register: Add menu item in `public/home.html`

### Agregar endpoint personalizado
```javascript
// src/routes/crud.routes.js (or dedicated routes file)
router.post("/r_auction/:id/bid", requireAuth, async (req, res, next) => {
  try {
    // Validate input
    const amount = Number(req.body?.value);
    if (amount <= 0) return res.status(400).json({ error: "INVALID_BID" });
    
    // Business logic
    const created = await prisma.r_bid.create({
      data: {
        id_auction: BigInt(req.params.id),
        id_user: BigInt(req.auth.sub),
        value: amount,
      },
    });
    
    // Respond
    return res.status(201).json({ ok: true, data: jsonSafe(created) });
  } catch (err) {
    return next(err);
  }
});
```

### Agregar validación Zod
```javascript
const { z } = require("zod");

const userSchema = z.object({
  login: z.string().email(),
  password: z.string().min(8),
  is_active: z.boolean().optional(),
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const validated = userSchema.parse(req.body);
    // Safe to use validated data
  } catch (err) {
    return res.status(400).json({ error: err.errors[0].message });
  }
});
```

## Execution Commands

- **Dev**: `npm run dev` (nodemon watch mode from `/App` dir)
- **Start**: `npm start` (production from `/App` dir)
- **Migrate**: `npx prisma migrate dev --name <name>` (from `/App` dir)
- **Studio**: `npx prisma studio` (UI from `/App` dir)
- **Test**: `node scripts/test-modules.js OR node scripts/test-db.js`
- **Prisma generate**: `npx prisma generate` (regenerate types)

## Key Database Relationships

**Show Deal Core Models**:
- `r_user` ← `r_role` (many-to-one)
- `r_user` ← `r_company` (many-to-one)
- `r_auction` ← `r_event` (many-to-one)
- `r_auction` ← `r_asset` (many-to-one)
- `r_bid` ← `r_user` (many-to-one)
- `r_bid` ← `r_auction` (many-to-one)
- `r_connection` → `r_company` + `r_asset` (asset visibility to companies)
- `r_invitation` → `r_company` + `r_event` (event visibility to companies)

**Sealed-bid auctions**: Each user can submit only ONE bid per auction (enforced in backend)
**Event window**: Offers only valid if `start_at ≤ now ≤ end_at`

## Context & Resources

- **Entity Relationship Diagram**: `/Docs/EntityRelationshipModel.architect`
- **Database Schema**: `/Docs/showDeal.sql`
- **Copilot Instructions**: `/.github/copilot-instructions.md`

---

**Cuando usar este agente**: Implementación de features, debugging backend/frontend, refactorización, diseño de API, troubleshooting de BD, arquitectura de módulos CRUD.

**NO usar para**: DevOps/deployment, infrastructure, security testing, QA/testing (hay agentes especializados).
