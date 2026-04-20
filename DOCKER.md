# ShowDeal Docker Setup Guide

## 📋 Tabla de Contenidos

1. [Inicio Rápido](#inicio-rápido)
2. [Estructura de Archivos](#estructura-de-archivos)
3. [Configuración y Variables de Entorno](#configuración-y-variables-de-entorno)
4. [Comandos Principales](#comandos-principales)
5. [Desarrollo Local](#desarrollo-local)
6. [Deployment a Producción](#deployment-a-producción)
7. [Troubleshooting](#troubleshooting)
8. [Referencias](#referencias)

---

## 🚀 Inicio Rápido

### Opción 1: Con Docker Compose (Recomendado)

```bash
# 1. Navegar al directorio App
cd showDeal/App

# 2. Copiar configuración (.env.docker)
cp .env.docker .env

# 3. Levantar servicios (app + PostgreSQL + Redis)
docker-compose up -d

# 4. Esperar a que postgres esté listo (30-40 segundos)
docker-compose logs -f postgres

# 5. Generar cliente Prisma en el contenedor
docker-compose exec app npx prisma generate

# 6. Acceder a la aplicación
# Frontend: http://localhost:3000
# API Health: http://localhost:3000/health
# Logs en vivo: docker-compose logs -f app
```

### Opción 2: Build Manual (sin Docker Compose)

```bash
# Build imagen
docker build -t showdeal:latest .

# Correr contenedor
docker run -it \
  -e DATABASE_URL="postgresql://user:pass@host:5432/db" \
  -e JWT_SECRET="your-secret" \
  -p 3000:3000 \
  showdeal:latest
```

---

## 📁 Estructura de Archivos Docker

```
showDeal/App/
├── Dockerfile                 # Multi-stage build optimizado
├── docker-compose.yml         # Orquestación local (app + DB + Redis)
├── .dockerignore              # Archivos a excluir de la imagen
├── .env.docker                # Variables de entorno para desarrollo
├── healthcheck.js             # Script de salud del contenedor
├── docker/
│   └── init-db.sql            # Inicialización de esquema + seed data
├── src/                       # Código fuente (Node.js)
├── public/                    # Frontend estático
├── prisma/
│   └── schema.prisma          # Schema Prisma ORM
├── package.json               # Dependencias
└── uploads/                   # Volumen para archivos (mapeado en compose)
```

---

## ⚙️ Configuración y Variables de Entorno

### Desarrollo Local (.env.docker)

```env
# Application
NODE_ENV=development
LOG_LEVEL=info
PORT=3000
APP_PORT=3000

# Database
DB_USER=showdeal
DB_PASSWORD=showdeal_dev_password
DB_NAME=showdeal
DB_PORT=5432

# JWT (cambiar en producción!)
JWT_SECRET=dev-secret-key-min-32-characters-xxxxxxxxxxxxxxxx
JWT_EXPIRES_IN=8h
JWT_CHALLENGE_SECRET=dev-challenge-secret-xxxxxxxxxxxxxxx
JWT_CHALLENGE_EXPIRES_IN=5m

# Redis
REDIS_PASSWORD=redis_dev_password
REDIS_PORT=6379

# File Upload
MAX_FILE_SIZE=10485760

# Monitoring (opcional)
LOG_LEVEL=info
# SENTRY_DSN=https://xxxxx@sentry.io/xxxxx
```

### Producción (Heroku/Railway/Render)

```env
# Usar variables de entorno seguras en la plataforma
# NO usar .env en producción

# Generar secrets fuertes:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

NODE_ENV=production
LOG_LEVEL=warn
DATABASE_URL=postgresql://prod_user:strong_pass@prod.db.host:5432/showdeal
JWT_SECRET=<generated-random-32-chars>
JWT_CHALLENGE_SECRET=<generated-random-32-chars>
REDIS_URL=redis://:strong_pass@redis.host:6379
```

---

## 🛠️ Comandos Principales

### Variables Prácticas

```bash
# En tu terminal, define:
cd showDeal/App
```

### Desarrollo

```bash
# ✅ Levantar stack completo (dev)
docker-compose up -d

# ✅ Ver logs en tiempo real
docker-compose logs -f app

# ✅ Logs de base de datos
docker-compose logs -f postgres

# ✅ Entrar a la app (shell)
docker-compose exec app sh

# ✅ Entrar a PostgreSQL
docker-compose exec postgres psql -U showdeal -d showdeal

# ✅ Detener servicios
docker-compose down

# ✅ Detener y eliminar volúmenes (limpiar BD)
docker-compose down -v

# ✅ Rebuild imagen (si cambiaste package.json)
docker-compose up -d --build

# ✅ Ver estado de servicios
docker-compose ps
```

### Prisma ORM

```bash
# Generar cliente Prisma
docker-compose exec app npx prisma generate

# Ver migraciones
docker-compose exec app npx prisma migrate status

# Crear nueva migración (si modificas schema.prisma)
docker-compose exec app npx prisma migrate dev --name add_new_table

# Reset BD (⚠️ borra datos!)
docker-compose exec app npx prisma migrate reset

# Abrir Prisma Studio (UI visual de BD)
docker-compose exec app npx prisma studio
# Abre en: http://localhost:5555
```

### Database

```bash
# Conectar a PostgreSQL desde host
psql -h localhost -U showdeal -d showdeal
# Contraseña: showdeal_dev_password

# Backup de base de datos
docker-compose exec postgres pg_dump \
  -U showdeal showdeal > backup_$(date +%s).sql

# Restore desde backup
docker-compose exec -T postgres psql \
  -U showdeal showdeal < backup.sql
```

### Testing

```bash
# Ejecutar tests de módulos BD
docker-compose exec app npm run test:modules

# Tests con coverage (si está configurado)
docker-compose exec app npm test -- --coverage
```

### Image Management

```bash
# Ver imágenes
docker images | grep showdeal

# Ver tamaño de imagen
docker images showdeal --no-trunc --quiet | xargs docker inspect --format='{{.Size}}'

# Limpiar imágenes no utilizadas
docker image prune -a

# Tag para registry
docker tag showdeal:latest myregistry/showdeal:1.0.0

# Push a registry
docker push myregistry/showdeal:1.0.0
```

---

## 🔨 Desarrollo Local

### Configuración Inicial

```bash
# 1. Clonar repo (si no lo tienes)
git clone <repo-url>
cd showDeal/App

# 2. Levantar servicios
docker-compose up -d

# 3. Esperar health check de postgres
sleep 40

# 4. Generar Prisma client
docker-compose exec app npx prisma generate

# 5. Verificar que funciona
curl http://localhost:3000/health
# Debería retornar: {"status":"ok","timestamp":"..."}
```

### Live Reload en Desarrollo

El `docker-compose.yml` mapea volúmenes para hot-reload:

```yaml
volumes:
  - ./src:/app/src:delegated         # Cambios instantáneos
  - ./public:/app/public:delegated   # Cambios instantáneos
  - ./prisma:/app/prisma:delegated   # Cambios instantáneos
```

Cuando edites un archivo en `src/`, `public/` o `prisma/`, **nodemon** automáticamente reinicia la aplicación.

```bash
# Monitorear cambios
docker-compose logs -f app | grep -E "(nodemon|listening)"

# Debería ver:
# [nodemon] restarting due to changes...
# [showdeal-api] listening on http://localhost:3000
```

### Debug con Node Inspector

Para debuggear con Chrome DevTools:

```bash
# 1. Modificar Dockerfile temporalmente o usar docker-compose override
# Cambiar CMD a: node --inspect=0.0.0.0:9229 src/server.js

# 2. Dentro de docker-compose.yml, agregar puerto:
# ports:
#   - "9229:9229"  # Node Inspector

# 3. Levantar con debug
docker-compose up -d

# 4. Abrir en Chrome:
# chrome://inspect/#devices
# Debería aparecer showdeal-api
```

### Acceso a Servicios Locales

```
Frontend:    http://localhost:3000
API:         http://localhost:3000
Health:      http://localhost:3000/health
PostgreSQL:  localhost:5432
Redis:       localhost:6379
Prisma UI:   http://localhost:5555 (cuando ejecutas `npx prisma studio`)
```

---

## 🚢 Deployment a Producción

### Opción 1: Heroku (Recomendado para MVP)

#### Preparación

```bash
# 1. Crear Dockerfile.heroku (o usar Dockerfile actual)
# 2. Instalar Heroku CLI: https://devcenter.heroku.com/articles/heroku-cli

# 3. Login
heroku login

# 4. Crear app
heroku create showdeal-prod

# 5. Agregar PostgreSQL
heroku addons:create heroku-postgresql:postgresql-14 -a showdeal-prod

# 6. Agregar Redis (opcional)
heroku addons:create heroku-redis:premium-0 -a showdeal-prod
```

#### Deploy

```bash
# 1. Agregar remote de Heroku
git remote -v  # Verificar

# 2. Deploy desde Git
git push heroku main

# 3. Ver logs
heroku logs --tail -a showdeal-prod

# 4. Configurar variables de entorno
heroku config:set NODE_ENV=production -a showdeal-prod
heroku config:set JWT_SECRET=<generated-secret> -a showdeal-prod
# ... más variables ...

# 5. Ejecutar migraciones si es necesario
heroku run "npx prisma migrate deploy" -a showdeal-prod

# 6. Ver app en vivo
heroku open -a showdeal-prod
```

### Opción 2: Railway.app (Más moderno)

```bash
# 1. Conectar repo a Railway: https://railway.app

# 2. Configurar variables de entorno en dashboard

# 3. Railway automáticamente:
#    - Detecta Dockerfile
#    - Build imagen
#    - Deploy

# 4. Ver logs
railway logs

# 5. Dominio automático: showdeal-prod.railway.app
```

### Opción 3: Docker Registry + Render/DigitalOcean

```bash
# 1. Build imagen
docker build -t showdeal:1.0.0 .

# 2. Tag para registry
docker tag showdeal:1.0.0 yourusername/showdeal:1.0.0

# 3. Push a Docker Hub
docker login
docker push yourusername/showdeal:1.0.0

# 4. En Render/DigitalOcean, crear servicio desde imagen
# - Imagen: yourusername/showdeal:1.0.0
# - Puerto expuesto: 3000
# - Servicios: PostgreSQL, Redis (como add-ons)
# - Variables de entorno: DATABASE_URL, JWT_SECRET, etc.
```

### Certificados SSL/HTTPS

```bash
# Heroku: Automático con *.herokuapp.com
# Railway: Automático con *.railway.app
# Custom domain: Usar Let's Encrypt

# Para custom domain en Heroku:
heroku domains:add showdeal.com -a showdeal-prod
heroku certs:auto:enable -a showdeal-prod
```

---

## 🔍 Troubleshooting

### Error: "Connection refused" a PostgreSQL

```bash
# Problema: Postgres no está listo cuando app intenta conectar

# Solución:
docker-compose down -v
docker-compose up -d postgres
sleep 30  # Esperar a que postgres esté listo
docker-compose up -d app
```

### Error: "Port 3000 already in use"

```bash
# Encontrar proceso usando puerto 3000
lsof -i :3000        # macOS/Linux
netstat -ano | findstr :3000  # Windows

# Matar proceso o usar puerto diferente
docker-compose down
# O cambiar APP_PORT en .env
```

### Error: "ENOENT: no such file or directory" en uploads/

```bash
# Problema: Directorio uploads no existe en volumen

# Solución:
mkdir -p uploads
docker-compose exec app chown -R 1001:1001 /app/uploads
docker-compose restart app
```

### Base de datos está rota (schema inconsistente)

```bash
# Reset completo (⚠️ borra toda BD)
docker-compose exec app npx prisma migrate reset --force
docker-compose restart
```

### Memory usage muy alto

```bash
# Limitar recursos en docker-compose.yml (ya incluido)
docker stats showdeal-api

# Si sigue alto, revisar:
# 1. Memory leaks en código (usar clinic.js)
# 2. Queries pesadas sin índices
# 3. Node heap size: NODE_OPTIONS=--max-old-space-size=512
```

### Imagen muy grande (>200MB)

```bash
# Verificar tamaño
docker images showdeal

# Optimizar:
# 1. Usar Alpine (ya incluido en Dockerfile)
# 2. Multi-stage build (ya usado)
# 3. Remover dev dependencies en producción (ya configurado)

# Analizar layers:
docker history showdeal:latest --no-trunc
```

---

## 🔒 Security Checklist

- [ ] Cambiar `JWT_SECRET` y `JWT_CHALLENGE_SECRET` en producción
- [ ] Usar HTTPS en producción
- [ ] No commitear `.env` a Git (usar `.env.example`)
- [ ] Usar variables de entorno para secrets, NO hardcodeados
- [ ] Non-root user en Docker (usuario `nodejs:1001`)
- [ ] Health check enabledo
- [ ] Rate limiting configurado en Express
- [ ] CORS whitelist configurado (ver `src/app.js`)
- [ ] Helmet headers habilitados
- [ ] Database backups automatizados
- [ ] Logs centralizados (Sentry, CloudWatch, etc.)

---

## 📊 Monitoreo Básico

```bash
# Health check manual
curl http://localhost:3000/health
# Respuesta esperada:
# {"status":"ok","timestamp":"2026-04-19T...","uptime":123}

# Logs detallados
docker-compose logs app | tail -50

# Estadísticas de contenedores
docker stats --no-stream

# Verificar conexión a PostgreSQL
docker-compose exec app node -e "
const { prisma } = require('./src/db/prisma');
prisma.\$queryRaw['SELECT 1']
  .then(() => console.log('✓ DB OK'))
  .catch(e => console.error('✗ DB Error:', e.message))
"
```

---

## 🔗 Referencias

- Docker: https://docs.docker.com/
- Docker Compose: https://docs.docker.com/compose/
- Node.js Best Practices: https://nodejs.org/en/docs/guides/nodejs-performance/
- Prisma ORM: https://www.prisma.io/docs/
- PostgreSQL: https://www.postgresql.org/docs/
- Heroku Buildpacks: https://devcenter.heroku.com/articles/buildpacks
- Railway.app: https://docs.railway.app/
- OWASP Security: https://owasp.org/

---

## 📝 Notas Importantes

1. **Desarrollo**: Usa `.env.docker` con contraseñas de desarrollo
2. **Producción**: Usa variables de entorno seguras de tu plataforma (Heroku Config Vars, etc.)
3. **Migración de BD**: Siempre revisar `migrations/` antes de deployar
4. **Backups**: Implementar backup automático de PostgreSQL
5. **Logs**: Centralizar logs (Sentry, CloudWatch) en producción

---

**Última actualización**: Abril 2026 | **Versión**: 1.0
