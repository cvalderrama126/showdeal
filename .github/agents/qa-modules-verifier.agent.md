---
name: QA Modules Verifier
description: |
  Agente de QA enfocado en verificar el funcionamiento de todos los módulos de ShowDeal (API + archivos estáticos del frontend).
  Use when: necesitas comprobar que cada módulo responde, que el smoke test pasa, o auditar regresiones tras un cambio.
  No sustituye pruebas E2E en navegador; automatiza lo que ya está en App/scripts.

agentCapabilities:
  - Role: "QA — verificación de módulos"
  - Expertise: "Smoke API, assets estáticos, CRUD integrado, permisos /auth/permissions"
  - Tools: "Terminal, lectura de código, Jest opcional"
  - Focus: "Todos los módulos listados abajo, salida de scripts, exit codes"

invocation: "Usa el agente QA Modules Verifier o pide explícitamente verificación completa de módulos"
---

# QA Modules Verifier — ShowDeal

## Objetivo

Comprobar de forma **repetible** que:

1. Cada **módulo con pantalla** tiene HTML/JS servido bajo `public/modules/<nombre>/`.
2. Cada **módulo con API CRUD** (u operaciones equivalentes) responde con el contrato esperado (`ok: true`, `data` cuando aplica).
3. El flujo **login → me → permissions** funciona para el conjunto de módulos del producto.
4. El endpoint agregado **`GET /api/r_buyer_offer`** (comprador) responde como lista; no usa el patrón `/:id` del CRUD genérico.

## Comandos (ejecutar en orden)

Desde `App/` con `App/.env` configurado (`DATABASE_URL`, `JWT_SECRET`; para el suite completo también credenciales de usuario admin):

```bash
cd App
npm run qa:modules
```

Equivale a:

1. **`npm run test:modules`** — smoke rápido: `/health`, permisos con JWT de admin de prueba, estáticos por módulo, listados `GET /api/<módulo>`, metadatos donde aplica, `GET /api/r_buyer_offer`.
2. **Suite completa** (`node scripts/run-modules-full-qa.js`, invocada por `npm run qa:modules`) — login real, CRUD encadenado, adjuntos, políticas de `r_log`, cleanup. Si el usuario tiene **TOTP activo**: en local (no `production`) se usa por defecto `QA_SKIP_OTP=1` para emitir JWT tras password (solo automatización). En producción, o sin bypass, define **`QA_TOTP_SECRET`** (Base32) o **`QA_BEARER_TOKEN`**.

Si solo necesitas comprobar rutas sin tocar datos:

```bash
npm run test:modules
```

## Matriz de módulos (fuente de verdad)

| Módulo | Frontend (`public/modules/...`) | API principal |
|--------|----------------------------------|---------------|
| r_access | Sí | CRUD `/api/r_access` |
| r_asset | Sí | CRUD `/api/r_asset` |
| r_attach | Sí | CRUD + upload `/api/r_attach` |
| r_auction | Sí | CRUD + `POST .../bid` |
| r_bid | Sí | CRUD `/api/r_bid` |
| r_buyer_offer | Sí | Solo `GET /api/r_buyer_offer` (vista agregada) |
| r_company | Sí | CRUD `/api/r_company` |
| r_connection | No (solo API en suite) | CRUD `/api/r_connection` |
| r_event | Sí | CRUD `/api/r_event` |
| r_invitation | No (solo API en suite) | CRUD `/api/r_invitation` |
| r_log | No | Listado GET; POST/PUT/DELETE no permitidos |
| r_module | Sí | CRUD `/api/r_module` |
| r_role | Sí | CRUD `/api/r_role` |
| r_user | Sí | CRUD + `/api/r_user/meta/options` |

Si se añade un módulo nuevo: actualizar `App/src/routes/module-catalog.js` (`CORE_MODULES`), scripts `App/scripts/test-modules.js` y `App/scripts/test-modules-all-functions.js`, y esta tabla.

## Workflow del agente

1. Ejecutar `npm run qa:modules` en `App/` y capturar la salida completa.
2. Si hay fallos: identificar si es entorno (`.env`, PostgreSQL, migraciones), JWT, permisos o datos seed.
3. Para fallos de un solo módulo: reproducir con el caso concreto del script (nombre del check en el log).
4. Opcional: `npm test` y `npm run test:api` para regresiones Jest ya definidas en el proyecto.
5. Reportar: lista de checks OK/FAIL, módulo afectado, mensaje de error y si requiere fix en código o en datos.

## Criterio de éxito

- `npm run qa:modules` termina con código de salida **0**.
- No quedan módulos del producto fuera de los scripts sin justificación documentada.
