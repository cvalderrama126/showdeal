# Carpeta `_aislados/`

Esta carpeta contiene archivos que el análisis de QA identificó como **duplicados** o
**basura/obsoletos** en la raíz del repositorio. Se aislaron aquí (en lugar de borrarse)
para preservar el historial y permitir su revisión antes de una eliminación definitiva.

> Ningún archivo aislado es referenciado por la aplicación en ejecución, por el `Dockerfile`,
> por `App/docker-compose.yml`, ni por los workflows de `.github/`. La aplicación canónica
> vive en `App/` y todos sus equivalentes funcionales están allí.

## Contenido

### `duplicados_raiz_vs_App/`
Archivos que existen tanto en la raíz como en `App/` y cuya copia útil es la de `App/`.
La copia en la raíz no funciona porque referencia rutas (`src/`, `tests/`, `scripts/`,
`prisma/`) que **no existen** en la raíz, sino dentro de `App/`.

| Archivo                  | Copia canónica          | Motivo                                                                 |
|--------------------------|-------------------------|------------------------------------------------------------------------|
| `package.json`           | `App/package.json`      | Byte‑idéntico (md5 coincidente). En la raíz no hay `src/server.js`.    |
| `healthcheck.js`         | `App/healthcheck.js`    | El `App/Dockerfile` copia y ejecuta `App/healthcheck.js`.              |
| `jest.config.js`         | `App/jest.config.js`    | No hay `tests/` en la raíz; Jest se ejecuta desde `App/`.              |
| `artillery-config.yml`   | `App/artillery-config.yml` | El script `npm run load:test` está definido en `App/package.json`.  |
| `artillery-processor.js` | `App/artillery-processor.js` | Procesador referenciado por `App/artillery-config.yml`.            |

### `scripts_debug_obsoletos/`
Scripts puntuales de depuración que estaban en la raíz. Todos hacen
`require('./src/db/prisma')`, ruta que **no existe** desde la raíz (el módulo real está
en `App/src/db/prisma`), por lo que están **rotos** tal como estaban ubicados.

| Archivo                  | Propósito original                                              |
|--------------------------|-----------------------------------------------------------------|
| `debug-admin.js`         | Inspección manual del usuario administrador.                    |
| `debug-buyer-offer.js`   | Generación manual de un JWT para probar `r_buyer_offer`.        |
| `check-events.js`        | Listado ad‑hoc de eventos vigentes en BD.                       |
| `fix-event-window.js`    | Parche puntual para corregir ventanas de evento.                |

### `logs/`
| Archivo                  | Motivo                                                                     |
|--------------------------|----------------------------------------------------------------------------|
| `artillery-output.log`   | Log de una corrida pasada de Artillery. `.gitignore` ya excluye `*.log`.   |

## Archivos que **NO** se aislaron (decisión consciente)

- `qa-analyzer.js`, `RUN_QA_TESTS.sh`, `verify-docker-setup.js`, `docker-dev.ps1`,
  `restart-dev.ps1` → están **referenciados** desde `RUN_QA_TESTS.sh`,
  `README_DOCKER.md`, `DOCKER_SOLUTION_SUMMARY.md` o `DOCKER_INSTALLATION_COMPLETE.txt`
  y se usan desde la raíz.
- Documentación histórica (`FASE*.md`, `SECURITY_*.md`, `QA_*.md`, `DOCKER*.md`,
  `PENETRATION_TEST_REPORT.md`, etc.) → no son basura: son entregables/registros
  del proyecto. Aunque hay archivos con el mismo nombre en raíz y en `App/`
  (`FASE4_*`, `FASE5_*`, `QA_ANALYSIS_COMPLETE.md`, `TEST_USERS_README.md`),
  su contenido es **distinto**, así que no son duplicados estrictos.

## Cómo restaurar un archivo

```bash
git mv _aislados/<categoria>/<archivo> ./<archivo>
```
