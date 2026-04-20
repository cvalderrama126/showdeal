# Deployment a Producción - Guía Completa

## 📚 Tabla de Contenidos

1. [Comparación de Plataformas](#comparación-de-plataformas)
2. [Heroku (Recomendado para MVP)](#heroku)
3. [Railway.app (Moderno)](#railwayapp)
4. [Render.com (Alternativa)](#rendercom)
5. [Checklist Predeployment](#checklist-predeployment)
6. [Post-Deployment](#post-deployment)
7. [Monitoreo](#monitoreo)

---

## 🔄 Comparación de Plataformas

| Aspecto | Heroku | Railway | Render | DigitalOcean |
|---------|--------|---------|--------|--------------|
| **Precio** | $7-50/mes | $5-30/mes | $7-30/mes | $6-40/mes |
| **Setup** | Muy fácil | Fácil | Fácil | Moderado |
| **Escalabilidad** | Buena | Buena | Media | Excelente |
| **PostgreSQL** | Add-on | Incluido | Add-on | VPS manual |
| **Redis** | Add-on | Incluido | Add-on | Manual |
| **SSL/HTTPS** | ✅ Automático | ✅ Automático | ✅ Automático | Manual |
| **Custom Domain** | ✅ | ✅ | ✅ | ✅ |
| **Docker Support** | ✅ | ✅ | ✅ | ✅ |
| **GitHub Integration** | ✅ | ✅ | ✅ | ✅ |
| **Recomendación** | MVP | Producción | Desarrollo | Escala |

---

## 🚀 Heroku

### Requisitos Previos

```powershell
# Instalar Heroku CLI
# Windows: choco install heroku-cli
# macOS: brew install heroku
# Linux: curl https://cli-assets.heroku.com/install.sh | sh

# Verificar instalación
heroku --version
```

### Pasos de Deployment

#### 1. Login en Heroku

```bash
heroku login
# Se abre navegador para autenticación
```

#### 2. Crear Aplicación

```bash
# Crear app nuevo
heroku create showdeal-prod

# Verificar
heroku apps
heroku info -a showdeal-prod
```

#### 3. Agregar Bases de Datos

```bash
# PostgreSQL (Plan Hobby = $9/mes)
heroku addons:create heroku-postgresql:postgresql-14 -a showdeal-prod

# Redis (Plan Premium-0 = $30/mes)
heroku addons:create heroku-redis:premium-0 -a showdeal-prod

# Verificar add-ons
heroku addons -a showdeal-prod
```

#### 4. Configurar Variables de Entorno

```bash
# Generar secrets seguros
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Copiar output para usar en los siguientes comandos

# Configurar variables
heroku config:set NODE_ENV=production -a showdeal-prod
heroku config:set PORT=3000 -a showdeal-prod
heroku config:set JWT_SECRET=<generated-random-secret> -a showdeal-prod
heroku config:set JWT_CHALLENGE_SECRET=<generated-random-secret> -a showdeal-prod
heroku config:set LOG_LEVEL=warn -a showdeal-prod

# DATABASE_URL y REDIS_URL se configuran automáticamente con add-ons
# Verificar
heroku config -a showdeal-prod
```

#### 5. Deploy con Docker

```bash
# Opción A: Deploy desde Git (automático)
git push heroku main

# Opción B: Deploy manual con Docker
heroku container:login
docker build -t showdeal:latest .
docker tag showdeal:latest registry.heroku.com/showdeal-prod/web
docker push registry.heroku.com/showdeal-prod/web
heroku container:release web -a showdeal-prod
```

#### 6. Ver Logs

```bash
# Logs en tiempo real
heroku logs --tail -a showdeal-prod

# Logs filtrados
heroku logs -a showdeal-prod | tail -50
```

#### 7. Ejecutar Migraciones

```bash
# Prisma migrations
heroku run "npx prisma migrate deploy" -a showdeal-prod

# Seed data inicial (si tienes seed script)
heroku run "npm run seed" -a showdeal-prod
```

#### 8. Abrir Aplicación

```bash
heroku open -a showdeal-prod
# Abre https://showdeal-prod.herokuapp.com
```

### Configurar Custom Domain

```bash
# Agregar dominio
heroku domains:add showdeal.com -a showdeal-prod

# Habilitar SSL automático
heroku certs:auto:enable -a showdeal-prod

# Configurar DNS 
# En tu registrador de dominio:
# CNAME showdeal.com showdeal-prod.herokuapp.com

# Verificar
heroku domains -a showdeal-prod
```

### Escalado en Heroku

```bash
# Ver dynos (servidores)
heroku ps -a showdeal-prod

# Escalar a 2 dynos
heroku ps:scale web=2 -a showdeal-prod

# Cambiar tipo de dyno (Standard-1X = $25)
heroku ps:type Standard-1X -a showdeal-prod

# Ver costos
heroku calculate-dyno-hours --app showdeal-prod
```

### Rollback en Heroku

```bash
# Ver releases previas
heroku releases -a showdeal-prod

# Rollback a versión anterior
heroku rollback v5 -a showdeal-prod
```

---

## 🚀 Railway.app

### Requisitos Previos

1. Cuenta GitHub (OAuth login)
2. Acceso a Railway Dashboard

### Pasos de Deployment

#### 1. Preparar Proyecto

```bash
# Verificar que tienes Dockerfile
# Railway detecta automáticamente

# Conectar repo a Railway (desde Dashboard)
# Railway > New Project > Deploy from GitHub
```

#### 2. Crear Servicios en Railway Dashboard

```
1. New Project
2. Deploy from GitHub Repo
3. Railway automáticamente:
   - Detecta Dockerfile
   - Crea imagen Docker
   - Deploy automático
```

#### 3. Configurar Variables de Entorno

```
En Dashboard Railway > Environment Variables:

NODE_ENV=production
JWT_SECRET=<generated-secret>
JWT_CHALLENGE_SECRET=<generated-secret>
LOG_LEVEL=warn

# DATABASE_URL se configura automáticamente si usas PostgreSQL add-on
```

#### 4. Agregar PostgreSQL y Redis

```
Railway Dashboard:
1. Services > + Add Service > PostgreSQL 15
2. Services > + Add Service > Redis
3. Las variables de conexión se vinculan automáticamente
```

#### 5. Deploy Automático (optional)

```
En GitHub Actions:
- Railway automáticamente detecta push a main
- Build + Deploy automático
- No requiere configuración extra
```

#### 6. Ver Logs

```
Railway Dashboard > Services > showdeal > Logs
O desde terminal:
railway logs
```

### Custom Domain en Railway

```bash
# En Railway Dashboard:
# Settings > Domains > Add Domain
# Ingresar: showdeal.com
# SSL automático

# En tu registrador:
# CNAME showdeal.com <railway-domain-provided>
```

### Rollback en Railway

```
Railway Dashboard > Deployments > Click deployment anterior > Redeploy
```

---

## 🚀 Render.com

### Pasos de Deployment

#### 1. Conectar GitHub

```
Render.com > New Web Service > Connect to GitHub
```

#### 2. Configuración de Servicio

```
Environment: Docker
Instance Type: Starter ($7/mes)
Branch to deploy: main
Auto-deploy: checked
```

#### 3. Variables de Entorno

```
En Render Dashboard > Environment > Add Environment Variable:

NODE_ENV: production
JWT_SECRET: <secret>
JWT_CHALLENGE_SECRET: <secret>
LOG_LEVEL: warn
```

#### 4. Agregar PostgreSQL

```
Render Dashboard:
1. New+ > PostgreSQL
2. Instance: Starter
3. Render vincula DATABASE_URL automáticamente
```

#### 5. Deploy

```
Render automáticamente hace deploy cada push a main
Ver progreso en Dashboard > Deploys
```

---

## ✅ Checklist Predeployment

### Código

- [ ] Todos los tests pasando
- [ ] Sin errores de linting
- [ ] `package-lock.json` actualizado
- [ ] `schema.prisma` validado
- [ ] `.env` NO está en Git (usar `.env.example`)

### Seguridad

- [ ] JWT_SECRET generado y único (32+ caracteres)
- [ ] Database credentials seguros
- [ ] CORS whitelist configurado correcto
- [ ] Helmet.js habilitado en producción
- [ ] Rate limiting configurado
- [ ] SQL injection prevention (Prisma está bien)
- [ ] XSS protection (Helmet headers)

### Database

- [ ] Migraciones Prisma aplicadas
- [ ] Seed data inicial listo
- [ ] Backups configurados
- [ ] Índices en columnas frecuentes

### Performance

- [ ] Docker image tamaño ~150MB
- [ ] Multi-stage build optimizado
- [ ] Health check incluido
- [ ] No console.log excessive en prod

### Monitoring

- [ ] Health endpoint (`/health`) funciona
- [ ] Logs estructurados (JSON)
- [ ] Sentry o similar configurado (opcional)
- [ ] Uptime monitoring (optional)

### Dominio

- [ ] Dominio registrado
- [ ] SSL certificate ready
- [ ] DNS A/CNAME records prepared
- [ ] Email for domain admin setup

---

## 📊 Post-Deployment

### Verificar Deployment

```bash
# Health check
curl https://showdeal.com/health
# Esperado: {"status":"ok","timestamp":"...","uptime":...}

# Verificar HTTPS
curl -I https://showdeal.com
# Ver: HTTP/2 200, Strict-Transport-Security header

# Verificar imágenes carga
# Abrir navegador: https://showdeal.com
```

### Configurar Monitoreo

```bash
# 1. Uptime monitoring (Status Page)
# - UptimeRobot.com
# - Pingdom
# - DataDog
# - Configure: https://showdeal.com/health

# 2. Error tracking
# - Sentry (JS/Node.js errors)
# - Rollbar (Alternative)
# - LogRocket (Frontend performance)

# 3. Performance monitoring
# - DataDog APM
# - New Relic
# - Elastic APM
```

### Backups Iniciales

```bash
# Heroku
heroku pg:backups:capture -a showdeal-prod

# Railway/Render
# Dentro del servicio PostgreSQL > Backups
```

### Crear Runbook

```markdown
# ShowDeal Production Runbook

## Alertas

### Health check fallido
1. SSH a servidor
2. Ver logs: heroku logs --tail
3. Verificar DB: heroku pg:info
4. Rollback si necesario: heroku rollback

### Escala automática
1. Monitor dyno resources
2. Si uso > 80%: heroku ps:scale web=2

## Maintenance

### Backup diario
- Heroku: Automático con add-on
- Railway: Configurar snapshot schedule

### Logs centralizados
- Configurar syslog en Heroku
- Usar CloudWatch/DataDog
```

---

## 📈 Monitoreo

### Métricas Clave

```bash
# Response time (p50, p95, p99)
# Error rate < 1%
# Availability > 99.5%
# Database connection pool
# Memory usage trending
# CPU utilization
```

### Alertas Recomendadas

```
- Health check falla (panda.com/health)
- Error rate > 5%
- Response time p95 > 1s
- Database connection pool > 80%
- Memory usage > 80%
- Disk space < 10%
- SSL certificate expira en 30 días
```

### Dashboard

```
Crear dashboard en DataDog/New Relic:
- Status: Green/Yellow/Red
- Request rate (RPS)
- Error rate
- Response time (p50, p95, p99)
- Database latency
- CPU & Memory
- Last deployment
```

---

## 🔗 Referencias

- **Heroku**: https://devcenter.heroku.com/
- **Railway**: https://docs.railway.app/
- **Render**: https://render.com/docs
- **DigitalOcean**: https://docs.digitalocean.com/
- **Let's Encrypt SSL**: https://letsencrypt.org/

---

## 💰 Estimado de Costos Mensuales

### Opción 1: Heroku

```
Web dyno (Eco): $5/mes
PostgreSQL (Standard): $50/mes
Redis (Premium-0): $30/mes
─────────────────────────
Total: ~$85/mes
```

### Opción 2: Railway/Render

```
Web Service: $10/mes
PostgreSQL: $15/mes
Redis: $10/mes
─────────────────────────
Total: ~$35/mes
```

### Opción 3: DigitalOcean (VPS)

```
Droplet 2GB RAM: $6/mes
PostgreSQL BaaS: $15/mes
Redis BaaS: $10/mes
─────────────────────────
Total: ~$31/mes
```

---

**Última actualización:** Abril 2026
**Versión:** 1.0
