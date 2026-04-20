# ShowDeal Programming Agent

Instrucciones personalizadas para desarrollo eficiente en el proyecto ShowDeal.

## Stack Tecnológico

- **Backend**: Node.js + Express.js
- **Base de Datos**: PostgreSQL + Prisma ORM
- **Autenticación**: JWT + OTP
- **Frontend**: HTML5 + JavaScript vanilla + Bootstrap 5
- **Almacenamiento**: Multer para uploads

## Estructura del Proyecto

```
App/
  ├── src/                 # Lógica backend
  │   ├── app.js          # Configuración Express
  │   ├── server.js       # Punto de entrada
  │   ├── auth/           # Servicios de autenticación
  │   ├── routes/         # Rutas API
  │   ├── users/          # Servicios usuarios
  │   ├── attachments/    # Servicios archivos
  │   └── db/             # Configuración Prisma
  ├── public/             # Frontend estático
  │   ├── modules/        # Módulos CRUD (r_*)
  │   └── assets/         # CSS, JS, librerías
  └── prisma/             # Esquema BD
```

## Patrones y Convenciones

### Nombres
- Modelos Prisma: `r_*` (r_user, r_role, r_access, r_module, etc.)
- Archivos servicio: `*.service.js`
- Archivos rutas: `*.routes.js`
- Módulos frontend: `r_*.html` + `r_*.js`

### Estructura Services
```javascript
// service.js
const { prisma } = require('../db/prisma');

async function getAll(filters = {}) {
  return await prisma.r_entity.findMany({ where: filters });
}

async function create(data) {
  return await prisma.r_entity.create({ data });
}

async function update(id, data) {
  return await prisma.r_entity.update({ where: { id }, data });
}

async function delete(id) {
  return await prisma.r_entity.delete({ where: { id } });
}

module.exports = { getAll, create, update, delete };
```

### Estructura Routes
```javascript
// routes.js
const express = require('express');
const { authenticate } = require('../auth/auth.middleware');
const service = require('./entity.service');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const data = await service.getAll();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST, PUT, DELETE...

module.exports = router;
```

## Scripts Útiles

- `npm run dev` - Desarrollar (nodemon)
- `npm start` - Producción
- `npm run test:modules` - Probar módulos BD
- `npx prisma studio` - UI para BD
- `npm run prisma:generate` - Generar cliente Prisma

## Mejores Prácticas

1. **Seguridad**
   - Validar entrada con Zod
   - Usar middleware `authenticate` en rutas protegidas
   - Hash contraseñas con bcryptjs
   - Implementar Rate Limiting

2. **Base de Datos**
   - Usar transacciones para operaciones complejas
   - Agregar índices cuando sea necesario
   - Validar integridad referencial
   - Usar timestamps `ins_at`, `upd_at`

3. **API**
   - Respuestas consistentes
   - Códigos HTTP apropiados
   - Manejo centralizado de errores
   - Documentar endpoints

4. **Frontend**
   - Módulos en `public/modules/r_*/`
   - Usar `api.js` para llamadas HTTP
   - Validar desde cliente y servidor
   - CSRF protection para formularios

## Debugging

- Logs en `src/` con `console.log`
- Prisma Studio: `npx prisma studio`
- DevTools en navegador para frontend
- Revisar `.env` para config BD

## Tareas Comunes

**Agregar nuevo módulo CRUD:**
1. Crear modelo en `prisma/schema.prisma`
2. Generar: `npx prisma migrate dev`
3. Crear `src/moduleName/moduleName.service.js`
4. Crear `src/moduleName/moduleName.routes.js`
5. Registrar ruta en `src/app.js`
6. Crear interfaz en `public/modules/r_moduleName/`

**Agregar autenticación a ruta:**
```javascript
router.post('/', authenticate, async (req, res) => { ... });
```

**Validar datos con Zod:**
```javascript
const { z } = require('zod');
const schema = z.object({ name: z.string().min(1) });
const validData = schema.parse(req.body);
```

## Contacto y Soporte

Para preguntas sobre arquitectura o patrones del proyecto, revisar:
- `Docs/EntityRelationshipModel.architect`
- `Docs/showDeal.sql`
