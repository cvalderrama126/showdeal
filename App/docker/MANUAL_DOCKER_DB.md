# ShowDeal — Manual de Configuración Docker (Base de Datos)

---

## Índice

1. [Requisitos Previos](#1-requisitos-previos)
2. [Estructura de Archivos](#2-estructura-de-archivos)
3. [Configuración de Variables de Entorno](#3-configuración-de-variables-de-entorno)
4. [Generar Hash de Contraseña](#4-generar-hash-de-contraseña)
5. [Levantar los Servicios](#5-levantar-los-servicios)
6. [Verificar la Inicialización](#6-verificar-la-inicialización)
7. [Acceder a la Base de Datos](#7-acceder-a-la-base-de-datos)
8. [Reiniciar desde Cero](#8-reiniciar-desde-cero)
9. [Solución de Problemas](#9-solución-de-problemas)
10. [Referencia de Variables](#10-referencia-de-variables)

---

## 1. Requisitos Previos

Antes de comenzar, asegúrese de tener instalado:

| Software         | Versión mínima | Verificar con            |
|-----------------|----------------|--------------------------|
| Docker          | 20.10+         | `docker --version`       |
| Docker Compose  | 2.0+           | `docker compose version` |
| Node.js         | 18+            | `node --version`         |

---

## 2. Estructura de Archivos

```
App/
├── docker-compose.yml          # Orquestación de servicios
├── .env.docker                 # Variables de entorno (personalizar)
├── .env.example                # Plantilla de referencia
└── docker/
    ├── init-db.sh              # Script de inicialización automática
    └── init-db.sql             # (referencia legacy, no se usa)
```

---

## 3. Configuración de Variables de Entorno

### Paso 3.1 — Copiar la plantilla

```bash
cd App/
cp .env.example .env.docker
```

### Paso 3.2 — Editar `.env.docker`

Abra el archivo y configure las siguientes secciones:

#### Base de Datos

```env
DB_USER=mi_usuario_personalizado
DB_PASSWORD=mi_clave_segura_2024
DB_NAME=showdeal
DB_PORT=5432
```

> **⚠️ IMPORTANTE:** Estos valores definen el usuario y contraseña de PostgreSQL.
> El contenedor creará automáticamente el usuario con estos datos al inicializar.

#### Usuario Administrador Inicial

```env
ADMIN_EMAIL=admin@miempresa.com
ADMIN_FULL_NAME=Juan Pérez
ADMIN_PHONE=+56-9-12345678
ADMIN_PASSWORD_HASH=$2a$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> El hash se genera en el Paso 4.

---

## 4. Generar Hash de Contraseña

El sistema usa bcrypt para almacenar contraseñas. Necesita generar un hash para el admin inicial.

### Opción A — Con Node.js (recomendado)

```bash
node -e "require('bcryptjs').hash('MiClaveSegura123!', 10).then(console.log)"
```

**Salida ejemplo:**
```
$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWdeS86E36P4JlFm
```

### Opción B — Desde el proyecto

```bash
cd App/
node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('MiClaveSegura123!', 10).then(h => console.log(h))"
```

### Paso 4.1 — Copiar el hash al `.env.docker`

```env
ADMIN_PASSWORD_HASH=$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWdeS86E36P4JlFm
```

> **Nota:** No use comillas alrededor del hash en el archivo `.env.docker`.

---

## 5. Levantar los Servicios

### Paso 5.1 — Navegar al directorio

```bash
cd App/
```

### Paso 5.2 — Levantar con Docker Compose

```bash
docker compose --env-file .env.docker up -d
```

### Paso 5.3 — Verificar que los contenedores están corriendo

```bash
docker compose ps
```

**Salida esperada:**

```
NAME                STATUS              PORTS
showdeal-postgres   Up (healthy)        0.0.0.0:5432->5432/tcp
showdeal-redis      Up (healthy)        0.0.0.0:6379->6379/tcp
showdeal-api        Up (healthy)        0.0.0.0:3000->3000/tcp
```

### Paso 5.4 — Ver logs de inicialización

```bash
docker compose logs postgres
```

**Buscar estas líneas:**

```
=== ShowDeal DB Init ===
  DB_USER:     mi_usuario_personalizado
  DB_NAME:     showdeal
  ADMIN_EMAIL: admin@miempresa.com
========================
=== ShowDeal DB Init Complete ===
  Admin user created: admin@miempresa.com
  Grants assigned to: mi_usuario_personalizado
=================================
```

---

## 6. Verificar la Inicialización

### Paso 6.1 — Conectar al contenedor PostgreSQL

```bash
docker exec -it showdeal-postgres psql -U mi_usuario_personalizado -d showdeal
```

### Paso 6.2 — Verificar schema

```sql
\dn
```

Debe mostrar:
```
   List of schemas
   Name    | Owner
-----------+---------------------------
 public    | mi_usuario_personalizado
 showdeal  | mi_usuario_personalizado
```

### Paso 6.3 — Verificar tablas

```sql
\dt showdeal.*
```

Debe listar: `r_role`, `r_module`, `r_access`, `r_user`, `r_company`, `r_asset`, `r_auction`, `r_bid`, `r_event`, `r_attach`.

### Paso 6.4 — Verificar usuario admin

```sql
SELECT email, full_name, phone FROM showdeal.r_user;
```

### Paso 6.5 — Salir

```sql
\q
```

---

## 7. Acceder a la Base de Datos

### Desde la aplicación

La app se conecta usando `DATABASE_URL` configurado en `docker-compose.yml`:

```
postgresql://DB_USER:DB_PASSWORD@postgres:5432/DB_NAME?schema=showdeal
```

### Desde herramientas externas (DBeaver, pgAdmin, etc.)

| Parámetro  | Valor                       |
|------------|-----------------------------|
| Host       | `localhost`                 |
| Puerto     | `5432` (o el `DB_PORT` configurado) |
| Base datos | `showdeal` (o su `DB_NAME`) |
| Usuario    | Su `DB_USER`                |
| Contraseña | Su `DB_PASSWORD`            |
| Schema     | `showdeal`                  |

### Desde Prisma Studio

```bash
cd App/
npx prisma studio
```

---

## 8. Reiniciar desde Cero

Si necesita reinicializar la base de datos (borrar todo y volver a crear):

### Paso 8.1 — Detener servicios

```bash
docker compose down
```

### Paso 8.2 — Eliminar volumen de datos

```bash
docker compose down -v
```

> **⚠️ CUIDADO:** Esto borra TODOS los datos de PostgreSQL y Redis.

### Paso 8.3 — Levantar de nuevo

```bash
docker compose --env-file .env.docker up -d
```

El script `init-db.sh` se ejecutará nuevamente creando todo desde cero con la configuración actual de `.env.docker`.

---

## 9. Solución de Problemas

### El contenedor postgres no arranca

```bash
docker compose logs postgres
```

**Causa común:** El volumen ya tiene datos de una configuración anterior con otro usuario.

**Solución:** `docker compose down -v` y levantar de nuevo.

---

### Error "permission denied" en init-db.sh

El script necesita permisos de ejecución. En Linux/Mac:

```bash
chmod +x App/docker/init-db.sh
```

En Windows con Git: el archivo ya debería tener permisos correctos si se clona con Git.

---

### El usuario admin no se creó

Verificar los logs:
```bash
docker compose logs postgres | grep "Admin user"
```

Si no aparece, probablemente el volumen ya existía. Ejecutar reinicio desde cero (Sección 8).

---

### No puedo conectarme desde fuera del contenedor

Verificar que el puerto está mapeado:
```bash
docker compose ps
```

Si usa un puerto personalizado en `DB_PORT`, conectar a ese puerto:
```bash
psql -h localhost -p 5433 -U mi_usuario -d showdeal
```

---

### Error en ADMIN_PASSWORD_HASH con caracteres especiales

El hash bcrypt contiene `$` que Docker Compose puede interpretar como variable. En el `docker-compose.yml` ya se usa `$$` para escapar. Si pone el hash directamente en `.env.docker`, NO necesita escapar.

---

## 10. Referencia de Variables

| Variable             | Default                    | Descripción                          |
|---------------------|----------------------------|--------------------------------------|
| `DB_USER`           | `showdeal`                 | Usuario PostgreSQL                   |
| `DB_PASSWORD`       | `showdeal_dev_password`    | Contraseña PostgreSQL                |
| `DB_NAME`           | `showdeal`                 | Nombre de la base de datos           |
| `DB_PORT`           | `5432`                     | Puerto expuesto al host              |
| `ADMIN_EMAIL`       | `admin@showdeal.com`       | Email del usuario admin inicial      |
| `ADMIN_PASSWORD_HASH` | hash de "password"       | Hash bcrypt de la contraseña admin   |
| `ADMIN_FULL_NAME`   | `Admin User`               | Nombre completo del admin            |
| `ADMIN_PHONE`       | `+1-555-0000`              | Teléfono del admin                   |

---

## Diagrama de Flujo

```
┌─────────────────────┐
│  .env.docker        │ ← Configurar usuario/clave/admin
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  docker compose up  │ ← Levantar servicios
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  PostgreSQL inicia   │
│  (primer arranque)   │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  init-db.sh         │ ← Crea schema, tablas, índices,
│  se ejecuta         │   seed data, grants con las
│  automáticamente    │   variables configuradas
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  BD lista           │ ← Usuario admin creado
│  App conecta        │   con email/clave personalizada
└─────────────────────┘
```

---

*Documento generado: Abril 2026 — ShowDeal v1.0*
