# Reporte QA – Verificación funcional y limpieza de archivos

**Fecha:** 2026‑04‑20
**Alcance:** (1) Verificación funcional de todos los módulos de ShowDeal y (2) detección y aislamiento de archivos duplicados / basura en el repositorio.
**Cambios de código de aplicación:** Ninguno. Sólo se movieron archivos huérfanos a `_aislados/`.

---

## 1. Resumen ejecutivo

| Bloque                                                | Resultado |
|-------------------------------------------------------|-----------|
| Inventario de módulos vs. catálogo (`CORE_MODULES`)   | ✅ 14 / 14 módulos presentes y montados en `crud.routes.js` |
| Frontend estático (`App/public/modules/r_*`)          | ✅ 11 / 11 módulos con UI sirven correctamente HTML+JS |
| Smoke `npm run test:modules` – frontend               | ✅ PASS (25/42 checks de estáticos y permisos) |
| Smoke `npm run test:modules` – API `/api/*`           | ⛔ FAIL **por entorno** (no hay PostgreSQL en el sandbox) |
| Suite Jest (`npm test`, `:api`, `:security`, `:validation`) | 🟥 **REGRESIÓN REAL P0** – `file-type@22` (ESM) rompe la carga de `src/app.js` en Jest |
| `npm run qa:modules`, `:full`, `:buyer`               | ⏭️ No ejecutables sin BD + credenciales `QA_BEARER_TOKEN`/`QA_TOTP_SECRET` |
| Limpieza de archivos basura/duplicados                | ✅ 10 archivos aislados en `_aislados/` con README justificativo |
| Integridad post‑limpieza                              | ✅ `node --check src/server.js` y `src/app.js` OK; ninguna referencia rota en `App/`, `.github/`, `Dockerfile` ni `docker-compose.yml` |

---

## 2. Matriz por módulo

Catálogo: `App/src/routes/module-catalog.js` (`CORE_MODULES`).
Wiring: `App/src/routes/crud.routes.js`.

| Módulo            | Backend montado | Frontend (HTML+JS) | Smoke estático | Smoke API (lista) | Notas |
|-------------------|-----------------|--------------------|----------------|-------------------|-------|
| `r_access`        | ✅              | ✅                 | ✅             | ⛔ sin BD          | Admin |
| `r_asset`         | ✅ + bulk       | ✅                 | ✅             | ⛔ sin BD          | `ownershipCheck` |
| `r_attach`        | ✅ + uploads    | ✅                 | ✅             | ⛔ sin BD          | Importa `file-type` (raíz de R‑1) |
| `r_auction`       | ✅ + `/:id/bid` | ✅                 | ✅             | ⛔ sin BD          | `ownershipCheck` |
| `r_bid`           | ✅              | ✅                 | ✅             | ⛔ sin BD          | `ownershipCheck` |
| `r_buyer_offer`   | ✅ (GET vista)  | ✅                 | ✅             | ⛔ sin BD          | Sin CRUD por diseño |
| `r_company`       | ✅              | ✅                 | ✅             | ⛔ sin BD          | Admin |
| `r_connection`    | ✅              | ⛔ sin UI (intencional) | n/a       | ⛔ sin BD          | Sólo API |
| `r_event`         | ✅ + filtro empresa | ✅             | ✅             | ⛔ sin BD          |  |
| `r_invitation`    | ✅              | ⛔ sin UI (intencional) | n/a       | ⛔ sin BD          | Sólo API |
| `r_log`           | ✅ (read‑only)  | ⛔ sin UI (intencional) | n/a       | ⛔ sin BD          | Política RO en routing |
| `r_module`        | ✅              | ✅                 | ✅             | ⛔ sin BD          | Admin |
| `r_role`          | ✅              | ✅                 | ✅             | ⛔ sin BD          | Admin |
| `r_user`          | ✅ + `/meta/options` | ✅            | ✅             | ⛔ sin BD          | Admin |

**Conclusión estructural:** Backend wiring 14/14, Frontend 11/11. Sin desviaciones del catálogo.

---

## 3. Hallazgos

### 🟥 R‑1 (Regresión real, P0) – Suite Jest no puede cargar ninguna prueba
- **Síntoma:**
  ```
  SyntaxError: Cannot use import statement outside a module
    node_modules/file-type/source/index.js:5
    > require("file-type")  en src/assets/asset-bulk.routes.js:27
  Test Suites: 4 failed, 4 total ; Tests: 0 total
  ```
- **Causa:** `file-type@^22` es ESM puro; el proyecto es `"type": "commonjs"` y `jest.config.js` no transpila esa dependencia.
- **Impacto:** `npm test`, `test:api`, `test:security`, `test:validation`, `test:performance`, `test:unit`, `test:coverage`, `qa:full` → todas en cero.
- **Fix recomendado (cualquiera de los tres):**
  1. Bajar a `file-type@^16.5.4` (último CJS).
  2. Migrar a `await import('file-type')` (lazy) dentro de las funciones que la usan en `App/src/assets/asset-bulk.routes.js` y `App/src/attachments/attachment.service.js`.
  3. Ajustar `App/jest.config.js` con
     `transformIgnorePatterns: ['/node_modules/(?!(file-type|strtok3|peek-readable|token-types)/)']`.

### 🟧 R‑2 (Entorno) – Sin PostgreSQL → 17 checks API FAIL y `/health` 500
- Todos los `GET /api/<modulo>` y `/health` devuelven `PrismaClientInitializationError` porque no hay BD en el sandbox. No es defecto de la app.
- **Acción:** levantar el `docker-compose` del repo, correr `npm run prisma:generate` y re‑ejecutar `npm run test:modules` y `npm run qa:modules`.

### 🟨 R‑3 (Entorno) – No hay `.env` en `App/`
- Sólo existen `.env.example` y `.env.docker`. Para QA hubo que inyectar `JWT_SECRET`, `JWT_CHALLENGE_SECRET`, `DATABASE_URL` por línea de comando.
- **Acción:** publicar un `.env.test` versionado (sin secretos reales).

### 🟨 R‑4 (Entorno) – `qa:modules` / `:full` / `:buyer` no ejecutables sin credenciales
- Requieren admin real + `QA_BEARER_TOKEN` o `QA_TOTP_SECRET`. Para CI: habilitar `QA_SKIP_OTP=1` (sólo `NODE_ENV≠production`) y publicar el bearer como secret.

### ℹ️ Higiene de dependencias (no bloqueante)
- `csurf@1.11.0` archivado.
- `otplib@12` deprecado (sugiere v13).
- Transitivas deprecadas: `glob@7/10`, `inflight`, `rimraf@2`, `lodash.isequal`.

---

## 4. Limpieza de archivos – `_aislados/`

Se creó `_aislados/` y se movieron 10 archivos de la raíz, organizados por categoría.
Se documentó la decisión y la forma de restaurar cada archivo en `_aislados/README.md`.

### 4.1 `_aislados/duplicados_raiz_vs_App/` (5 archivos)
Existen tanto en la raíz como en `App/`. La copia útil es la de `App/`; la de la raíz es huérfana porque referencia rutas que no existen en la raíz (`src/`, `tests/`, `scripts/`, `prisma/`).

| Archivo                  | Evidencia                                                                 |
|--------------------------|---------------------------------------------------------------------------|
| `package.json`           | **md5 byte‑idéntico** a `App/package.json` (`6915fd6c…`). En la raíz no hay `src/server.js` ni `scripts/`. |
| `healthcheck.js`         | `App/Dockerfile` hace `COPY healthcheck.js` y `CMD node /app/healthcheck.js` → usa la copia de `App/`. |
| `jest.config.js`         | No hay `tests/` en la raíz; Jest se invoca desde `App/`.                  |
| `artillery-config.yml`   | `npm run load:test` está definido en `App/package.json`.                  |
| `artillery-processor.js` | Procesador referenciado por `App/artillery-config.yml`.                   |

### 4.2 `_aislados/scripts_debug_obsoletos/` (4 archivos)
Scripts puntuales de depuración. Todos hacen `require('./src/db/prisma')`, ruta inexistente desde la raíz (`App/src/db/prisma` es la real) → **están rotos** tal como estaban ubicados.

| Archivo                | Propósito original                                            |
|------------------------|---------------------------------------------------------------|
| `debug-admin.js`       | Inspección manual del usuario administrador.                  |
| `debug-buyer-offer.js` | Generar JWT de prueba para `r_buyer_offer`.                   |
| `check-events.js`      | Listado ad‑hoc de eventos vigentes.                           |
| `fix-event-window.js`  | Parche puntual para corregir ventanas de evento.              |

### 4.3 `_aislados/logs/` (1 archivo)
| Archivo                | Motivo                                                              |
|------------------------|---------------------------------------------------------------------|
| `artillery-output.log` | Log de una corrida pasada. `.gitignore` ya excluye `*.log`.         |

### 4.4 Archivos que **NO** se aislaron (decisión consciente)
- `qa-analyzer.js`, `RUN_QA_TESTS.sh`, `verify-docker-setup.js`, `docker-dev.ps1`, `restart-dev.ps1`: están **referenciados** desde `RUN_QA_TESTS.sh`, `README_DOCKER.md`, `DOCKER_SOLUTION_SUMMARY.md` o `DOCKER_INSTALLATION_COMPLETE.txt`.
- Documentación histórica (`FASE*.md`, `SECURITY_*.md`, `QA_*.md`, `DOCKER*.md`, `PENETRATION_TEST_REPORT.md`, …). Aunque hay nombres repetidos en raíz y `App/` (`FASE4_*`, `FASE5_*`, `QA_ANALYSIS_COMPLETE.md`, `TEST_USERS_README.md`), su **contenido difiere** — no son duplicados estrictos.

### 4.5 Verificación post‑limpieza
- `node --check App/src/server.js` ✅
- `node --check App/src/app.js` ✅
- Búsqueda de referencias a los 10 archivos aislados en `App/`, `.github/`, `Dockerfile` y `docker-compose.yml`: **ninguna apunta a la raíz**; las coincidencias por nombre resuelven a las copias internas de `App/` que siguen intactas.

---

## 5. Recomendaciones priorizadas

| # | Prioridad | Acción |
|---|-----------|--------|
| 1 | 🔴 P0 | Resolver R‑1 (`file-type` ESM ↔ Jest CJS) para desbloquear la suite Jest y la cobertura. |
| 2 | 🔴 P0 | Levantar PostgreSQL de QA (docker‑compose ya disponible) y re‑ejecutar `npm run test:modules` + `npm run qa:modules`. |
| 3 | 🟠 P1 | Versionar un `.env.test` mínimo y documentar variables obligatorias en `App/README`. |
| 4 | 🟠 P1 | Habilitar `QA_SKIP_OTP=1` en CI (no‑prod) y publicar `QA_BEARER_TOKEN` como secret para que `qa:modules` corra en pipeline. |
| 5 | 🟡 P2 | Reemplazar `csurf` (archivado) y actualizar `otplib` a v13. |
| 6 | 🟡 P2 | Eliminar `tests/unit/` del script `test:unit` (no existe el directorio) o crearlo. |
| 7 | 🟢 P3 | Tras revisión, borrar definitivamente el contenido de `_aislados/` o moverlo a un branch de archivo. |

---

## 6. Veredicto

- **Estructura del producto:** ✅ íntegra (catálogo, wiring, frontend).
- **Frontend estático:** ✅ 11/11 módulos con UI funcionando.
- **API funcional:** ⛔ no verificable en este sandbox por ausencia de Postgres (R‑2).
- **Suite Jest:** ⛔ regresión real P0 (R‑1).
- **Higiene del repositorio:** ✅ 10 archivos basura/duplicados aislados en `_aislados/` sin romper ningún flujo.

➡️ **Acciones mínimas para volver a verde end‑to‑end:** (1) resolver R‑1 y (2) levantar Postgres de QA. Tras eso, `npm run qa:modules` debería terminar en 0 y `npm test` reportar cobertura real.
