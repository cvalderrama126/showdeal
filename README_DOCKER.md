# 🐳 ShowDeal - Docker & CI/CD Solution

> **Solución Docker completa y lista para producción** para el proyecto ShowDeal (Node.js + PostgreSQL + Redis)

## ⚡ Quick Start (5 minutos)

```powershell
# 1. Navegar al proyecto
cd showDeal\App

# 2. Copiar configuración
cp .env.docker .env

# 3. Levantar servicios
docker-compose up -d

# 4. Esperar ~40 segundos a que PostgreSQL esté listo
Start-Sleep -Seconds 40

# 5. Generar Prisma client
docker-compose exec app npx prisma generate

# 6. Verificar
curl http://localhost:3000/health
```

✅ **Listo!** Aplicación en http://localhost:3000

---

## 📦 Qué está incluido

### 🐋 Docker

- ✅ **Dockerfile** - Multi-stage build optimizado (~150MB)
  - Node.js 18 Alpine
  - Non-root user para seguridad
  - Health check incluido
  
- ✅ **docker-compose.yml** - Stack completo local
  - App (Node.js)
  - PostgreSQL 15
  - Redis 7 (caching)
  - Volúmenes para persistencia
  - Network aislada
  - Resource limits

- ✅ **.dockerignore** - Optimizado para imagen pequeña

- ✅ **healthcheck.js** - Verificación de salud del container

- ✅ **docker/init-db.sql** - Schema + seed data inicial

### 🔄 CI/CD (GitHub Actions)

- ✅ **build-test.yml** - Build + Lint + Test (automático en PR)
- ✅ **deploy-staging.yml** - Deploy a Railway staging
- ✅ **deploy-production.yml** - Deploy a Heroku/Railway + rollback automático

### 📚 Documentación

| Documento | Propósito |
|-----------|----------|
| [DOCKER.md](./DOCKER.md) | Guía completa (desarrollo, troubleshooting) |
| [DOCKER_QUICK_REFERENCE.md](./DOCKER_QUICK_REFERENCE.md) | Referencia rápida de comandos |
| [DOCKER_SOLUTION_SUMMARY.md](./DOCKER_SOLUTION_SUMMARY.md) | Resumen de archivos y próximos pasos |
| [GITHUB_ACTIONS_SETUP.md](./GITHUB_ACTIONS_SETUP.md) | Setup de CI/CD y GitHub secrets |
| [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) | Pasos detallados para Heroku/Railway/Render |

### 🛠️ Utilities

- ✅ **docker-dev.ps1** - PowerShell helper para comandos comunes

---

## 🚀 Endpoints & Servicios

```
🌐 Frontend:          http://localhost:3000
🌐 API:               http://localhost:3000
❤️  Health Check:     http://localhost:3000/health
🗄️  PostgreSQL:       localhost:5432
🔴 Redis:             localhost:6379
🧮 Prisma Studio:     http://localhost:5555 (after `npx prisma studio`)
```

---

## 📖 Guías por Caso de Uso

### 🔨 Desarrollo Local

```bash
# Levantar
docker-compose up -d

# Ver logs
docker-compose logs -f app

# Entrar a shell
docker-compose exec app sh

# Conectar a BD
docker-compose exec postgres psql -U showdeal -d showdeal

# Para detener
docker-compose down
```

**Ver:** [DOCKER.md - Desarrollo Local](./DOCKER.md#-desarrollo-local)

### 🧪 Testing

```bash
# Tests de módulos BD
docker-compose exec app npm run test:modules

# Tests generales (si están configurados)
docker-compose exec app npm test
```

### 🚀 Deployment a Producción

Tres opciones recomendadas:

1. **Heroku** (🎯 mejor para MVP)
   - Más fácil pero más caro (~$85/mes)
   - Automático SSL/HTTPS
   - [Ver pasos →](./DEPLOYMENT_GUIDE.md#-heroku)

2. **Railway.app** (⭐ balance perfecto)
   - Moderno, simple, barato (~$35/mes)
   - GitHub integration automática
   - [Ver pasos →](./DEPLOYMENT_GUIDE.md#-railwayapp)

3. **Render.com** (💰 alternativa)
   - Similar a Railway
   - [Ver pasos →](./DEPLOYMENT_GUIDE.md#-rendercom)

**Ver:** [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)

### 🔄 CI/CD Automático

1. Agregar GitHub secrets (ver [GITHUB_ACTIONS_SETUP.md](./GITHUB_ACTIONS_SETUP.md))
2. Hacer push a `develop` → Deploy automático a staging
3. Hacer push a `main` → Deploy automático a producción
4. Recibir notificaciones en Slack

---

## 🎯 Características

✨ **Production-Ready**
- Multi-stage Docker build optimizado
- Health checks configurados
- Security: non-root user, helmet.js, rate limiting
- Logs estructurados
- Error handling & rolleback

🚀 **Escalable**
- CI/CD automático (GitHub Actions)
- Deploy a múltiples plataformas
- Database migrations automáticas
- Backup strategies

🔒 **Seguro**
- Secrets en variables de entorno (NO hardcodeados)
- HTTPS ready
- SQL injection prevention (Prisma)
- XSS protection (Helmet)
- CORS whitelist

📊 **Monitoreable**
- Health check endpoint
- Structured logging
- Slack notifications
- Performance metrics

---

## 📚 Estructura de Archivos

```
showDeal/
├── App/
│   ├── Dockerfile                 # Multi-stage build
│   ├── docker-compose.yml         # Stack completo
│   ├── .dockerignore             # Optimización imagen
│   ├── .env.docker               # Variables de entorno
│   ├── healthcheck.js            # Health check script
│   ├── docker/
│   │   └── init-db.sql           # Schema + seed data
│   ├── src/                      # Node.js code
│   ├── public/                   # Frontend estático
│   ├── prisma/
│   │   └── schema.prisma         # Database schema
│   ├── package.json              # Dependencies
│   └── uploads/                  # Volumen para archivos
│
├── .github/
│   └── workflows/
│       ├── build-test.yml        # Build + Test on PR
│       ├── deploy-staging.yml    # Deploy a staging
│       └── deploy-production.yml # Deploy a producción
│
├── docker-dev.ps1                # PowerShell helper
├── verify-docker-setup.js        # Verificar setup
├── DOCKER.md                     # Guía completa
├── DOCKER_QUICK_REFERENCE.md     # Referencia rápida
├── DOCKER_SOLUTION_SUMMARY.md    # Resumen
├── GITHUB_ACTIONS_SETUP.md       # Setup CI/CD
└── DEPLOYMENT_GUIDE.md           # Pasos deployment
```

---

## 🔐 Seguridad Checklist

- ✅ Secrets en variables de entorno
- ✅ Non-root user en container
- ✅ Health check incluido
- ✅ Multi-stage build (imagen pequeña)
- ✅ CORS whitelist configurado
- ✅ Helmet.js habilitado
- ✅ Rate limiting ready
- ✅ Database credentials seguros
- ✅ JWT authentication
- ✅ OTP 2FA support

---

## 💰 Costos Esperados (Mensual)

| Plataforma | Costo | Incluye |
|-----------|-------|---------|
| **Heroku** | ~$85 | Web + DB + Redis |
| **Railway** | ~$35 | Web + DB + Redis |
| **Render** | ~$35 | Web + DB + Redis |
| **DigitalOcean** | ~$31 | VPS + DB + Redis |

---

## 🐛 Troubleshooting Rápido

| Problema | Solución |
|----------|----------|
| Connection refused a PostgreSQL | Ver [DOCKER.md](./DOCKER.md#-troubleshooting) |
| Puerto 3000 en uso | Cambiar `APP_PORT` en `.env` |
| Base de datos corrupta | `docker-compose exec app npx prisma migrate reset` |
| Tests fallando | Ver logs: `docker-compose logs app` |
| Imagen muy grande | Usar Dockerfile incluido (ya optimizado) |

📖 **Más:** [DOCKER.md - Troubleshooting](./DOCKER.md#-troubleshooting)

---

## 🔗 Comandos Útiles

### Control de Servicios

```bash
# Levantar todo
docker-compose up -d

# Ver estado
docker-compose ps

# Logs en vivo
docker-compose logs -f

# Detener
docker-compose down

# Limpiar todo (borra datos!)
docker-compose down -v
```

### Desarrollo

```bash
# Shell en app
docker-compose exec app sh

# Conectar a BD
docker-compose exec postgres psql -U showdeal -d showdeal

# Prisma Studio (UI visual)
docker-compose exec app npx prisma studio

# Ejecutar tests
docker-compose exec app npm run test:modules
```

### Database

```bash
# Backup
docker-compose exec postgres pg_dump -U showdeal showdeal > backup.sql

# Restore
cat backup.sql | docker-compose exec -T postgres psql -U showdeal showdeal

# Migraciones Prisma
docker-compose exec app npx prisma migrate status
```

📖 **Más:** [DOCKER_QUICK_REFERENCE.md](./DOCKER_QUICK_REFERENCE.md)

---

## ✅ Verificación

```bash
# Verificar que todo está en su lugar
node verify-docker-setup.js

# Si ves "All files are in place!" → ¡Listo!
```

---

## 📖 Documentación Completa

1. **PRIMERO:** Lee [DOCKER_SOLUTION_SUMMARY.md](./DOCKER_SOLUTION_SUMMARY.md) (resumen + próximos pasos)

2. **Desarrollo Local:** [DOCKER.md](./DOCKER.md) - Guía detallada con troubleshooting

3. **Deployment:** [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - Pasos para producción

4. **CI/CD:** [GITHUB_ACTIONS_SETUP.md](./GITHUB_ACTIONS_SETUP.md) - GitHub Actions workflows

5. **Referencia Rápida:** [DOCKER_QUICK_REFERENCE.md](./DOCKER_QUICK_REFERENCE.md) - Comandos comunes

---

## 🚀 Próximos Pasos

### 1️⃣ Hoy (Desarrollo)

```bash
cp App/.env.docker App/.env
docker-compose -f App/docker-compose.yml up -d
# ¡Empezar a desarrollar!
```

### 2️⃣ Semana 1 (Setup CI/CD - Opcional)

- Crear Docker Hub account
- Agregar GitHub secrets (ver [GITHUB_ACTIONS_SETUP.md](./GITHUB_ACTIONS_SETUP.md))
- Workflows se ejecutarán automáticamente

### 3️⃣ Cuando Listo (Deployment)

- Elegir plataforma (Heroku/Railway/Render)
- Seguir pasos en [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
- `docker-compose down`
- Happy customers! 🚀

---

## 🤝 Stack Tecnológico

```
┌─────────────────────────────────────────┐
│          ShowDeal Stack                 │
├─────────────────────────────────────────┤
│                                          │
│  Frontend:  HTML5 + JavaScript + Bootstrap
│  Backend:   Node.js 18 + Express.js     │
│  Database:  PostgreSQL 15 + Prisma ORM  │
│  Cache:     Redis 7                     │
│  Container: Docker + Docker Compose     │
│  CI/CD:     GitHub Actions              │
│  Auth:      JWT + OTP                   │
│  Files:     Multer uploads              │
│                                          │
└─────────────────────────────────────────┘
```

---

## 📞 Help & Support

### Verificación Rápida

```bash
# ¿Funciona todo?
curl http://localhost:3000/health

# ¿Ve los servicios?
docker-compose ps

# ¿Hay logs de error?
docker-compose logs app
```

### Documentación por Problema

- **Docker no funciona** → [DOCKER.md](./DOCKER.md#-troubleshooting)
- **No sé qué comando usar** → [DOCKER_QUICK_REFERENCE.md](./DOCKER_QUICK_REFERENCE.md)
- **Quiero deployar** → [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
- **CI/CD no funciona** → [GITHUB_ACTIONS_SETUP.md](./GITHUB_ACTIONS_SETUP.md)

---

## 📝 Notas Importantes

1. ⚠️ **Cambiar secrets antes de producción** - Los incluidos son solo para desarrollo
2. 📁 **NO commitear `.env`** a Git - Usar `.env.example`
3. 🔒 **Usar variables de entorno** en producción, no archivos `.env`
4. 🚀 **Deploy fácil** con GitHub Actions automático
5. 💾 **Backups automáticos** en Heroku/Railway/Render

---

## 🎉 Créditos

Solución Docker profesional lista para producción.
Incluye testing, CI/CD, monitoreo y deployment automático.

**Version:** 1.0  
**Última actualización:** Abril 2026

---

**¿Preguntas?** Ver [DOCKER_SOLUTION_SUMMARY.md](./DOCKER_SOLUTION_SUMMARY.md) o contactar al team.

**¡Listo para 🚀!**
