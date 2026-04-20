---
name: QA Guidelines
description: |
  Instrucciones para testing, validación de seguridad y code review en showDeal.
  Aplica automáticamente a archivos de test y análisis de QA.
---

# Guía de QA para ShowDeal

## Verificación automática de todos los módulos

Desde `App/`:

```bash
npm run qa:modules
```

Incluye smoke de estáticos (`public/modules/...`), listados API, `GET /api/r_buyer_offer`, y suite completa con login (`QA_LOGIN_USER` / `QA_LOGIN_PASSWORD`). Detalle y matriz de módulos: `.github/agents/qa-modules-verifier.agent.md`.

## Testing Backend

### Estructura de Tests
```javascript
// test/moduleName.test.js
const { prisma } = require('../src/db/prisma');
const request = require('supertest');
const app = require('../src/app');

describe('Module Name', () => {
  beforeAll(async () => {
    // Setup
  });

  afterAll(async () => {
    // Cleanup
    await prisma.$disconnect();
  });

  describe('GET /', () => {
    it('should return all items', async () => {
      const res = await request(app).get('/api/module');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/module');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /', () => {
    it('should create with valid data', async () => {
      const data = { name: 'Test' };
      const res = await request(app)
        .post('/api/module')
        .set('Authorization', `Bearer ${token}`)
        .send(data);
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
    });

    it('should validate required fields', async () => {
      const res = await request(app)
        .post('/api/module')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '' });
      expect(res.status).toBe(400);
    });
  });
});
```

### Test Checklist Backend
- [ ] Happy path: Operación correcta con datos válidos
- [ ] Validación: Rechaza datos inválidos (Zod schema)
- [ ] Autenticación: Requiere JWT válido
- [ ] Autorización: Valida permisos (access control)
- [ ] Errores: Códigos HTTP correctos (400, 401, 403, 404, 500)
- [ ] BD: Transacciones, integridad referencial
- [ ] Edge cases: Limites, nulls, valores especiales
- [ ] Performance: Queries N+1, índices

## Testing Frontend

### Validación de Módulos
```
Para cada módulo r_moduleName/:
- [ ] HTML valida (estructura, form fields)
- [ ] JS: Validación cliente antes de enviar
- [ ] API calls: Usa api.js, maneja errores
- [ ] Auth: Guard.js valida acceso
- [ ] CRUD: Create, Read, Update, Delete funciona
- [ ] Errores: Muestra mensajes al usuario
- [ ] Responsive: Funciona en mobile
```

### Test E2E (Playwright)
```javascript
test('User CRUD flow', async ({ page }) => {
  // Login
  await page.goto('http://localhost:3000');
  await page.fill('#username', 'admin');
  await page.fill('#password', 'password');
  await page.click('button[type="submit"]');

  // Navigate to module
  await page.goto('http://localhost:3000/modules/r_module');

  // Create
  await page.click('[data-action="create"]');
  await page.fill('[name="name"]', 'Test Item');
  await page.click('button:has-text("Save")');
  await expect(page).toContainText('Test Item');

  // Update
  await page.click('[data-action="edit"]:first-child');
  await page.fill('[name="name"]', 'Updated Item');
  await page.click('button:has-text("Save")');

  // Delete
  await page.click('[data-action="delete"]:first-child');
  await page.click('button:has-text("Confirm")');
  await expect(page).not.toContainText('Updated Item');
});
```

## Security Checklist

### Autenticación y Autorización
- [ ] JWT tokens validados en rutas protegidas
- [ ] Expiración de tokens configurada
- [ ] Refresh tokens implementados
- [ ] OTP validado correctamente
- [ ] Access control: Usuarios solo ven sus datos
- [ ] Roles y permisos en r_access/r_module

### Input Validation
- [ ] Zod schemas en todas las rutas
- [ ] Validación servidor (nunca confiar en cliente)
- [ ] Sanitización de strings (XSS prevention)
- [ ] Límites de tamaño (file uploads)

### Output Encoding
- [ ] JSON safe: No devuelve datos sensibles
- [ ] HTML escaped en frontend
- [ ] No expone stack traces en producción

### Database Security
- [ ] Queries parametrizadas (Prisma)
- [ ] No SQL injection posible
- [ ] Índices en foreign keys
- [ ] Backup strategy

### Other
- [ ] HTTPS en producción
- [ ] CORS configurado correctamente
- [ ] Rate limiting en endpoints sensibles
- [ ] Helmet.js headers configurado
- [ ] Logs sin datos sensibles

## Code Review Patterns

### Services
```javascript
// ✅ BIEN: Manejo de errores, validación
async function create(data) {
  const schema = z.object({ name: z.string() });
  const validated = schema.parse(data);
  try {
    return await prisma.r_module.create({ data: validated });
  } catch (error) {
    if (error.code === 'P2002') throw new Error('Already exists');
    throw error;
  }
}

// ❌ MAL: Sin validación, sin manejo de errores
async function create(data) {
  return await prisma.r_module.create({ data });
}
```

### Routes
```javascript
// ✅ BIEN: Middleware, try-catch, códigos HTTP
router.post('/', authenticate, async (req, res) => {
  try {
    const data = await service.create(req.body);
    res.status(201).json(data);
  } catch (error) {
    const status = error.message.includes('validation') ? 400 : 500;
    res.status(status).json({ error: error.message });
  }
});

// ❌ MAL: Sin autenticación, sin error handling
router.post('/', async (req, res) => {
  const data = await service.create(req.body);
  res.json(data);
});
```

## Performance Optimization

### Database
- Usar índices en foreign keys
- Eager loading: `include` en Prisma
- Evitar queries en loops (N+1)
- Usar transacciones para consistencia

### API
- Pagination en listados
- Select solo campos necesarios
- Caching (Redis para datos estáticos)
- Compresión HTTP (gzip)

### Frontend
- Lazy loading de módulos
- Minimizar JS/CSS
- Imágenes optimizadas
- Debounce en búsquedas

## Debugging Tips

### Backend
```bash
# Logs con contexto
console.log('Creating user:', { email, role });

# Prisma Studio para ver datos
npx prisma studio

# Debug con debugger
node --inspect src/server.js

# Ver queries SQL
set DEBUG=prisma:*
```

### Frontend
- DevTools: Console, Network, Storage
- Breakpoints en eventos
- Watch expressions para variables

## Reporting

### Bug Report Template
```
**Resumen**: [Descripción breve]

**Pasos para reproducir**:
1. 
2. 
3. 

**Comportamiento esperado**: 

**Comportamiento actual**: 

**Severity**: [Crítica/Alta/Media/Baja]

**Componente**: [Backend/Frontend/BD]

**Stack trace**: (si aplica)
```
