# GitHub Actions CI/CD Setup Guide

## 🔐 Configurar Secrets en GitHub

### 1. Navegar a Settings > Secrets and Variables > Actions

### 2. Agregar los siguientes secrets:

#### **Docker Hub**
```
DOCKERHUB_USERNAME=tu_usuario_dockerhub
DOCKERHUB_TOKEN=tu_token_dockerhub (Personal Access Token)
```

#### **Heroku (opcional)**
```
HEROKU_API_KEY=tu_heroku_api_key
HEROKU_EMAIL=tu_email@example.com
HEROKU_APP_NAME=showdeal-prod
```

#### **Railway (opcional)**
```
RAILWAY_API_TOKEN=tu_railway_token
RAILWAY_PROD_API_TOKEN=tu_railway_prod_token
STAGING_API_URL=https://staging.showdeal.com
PROD_API_URL=https://showdeal.com
```

#### **Slack (para notificaciones)**
```
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

#### **Database URLs (Staging)**
```
STAGING_DATABASE_URL=postgresql://user:pass@staging-db.host:5432/showdeal
STAGING_REDIS_URL=redis://:password@staging-redis.host:6379
STAGING_JWT_SECRET=<generated-random-secret-32-chars>
STAGING_JWT_CHALLENGE_SECRET=<generated-random-32-chars>
```

#### **Database URLs (Production)**
```
PROD_DATABASE_URL=postgresql://user:pass@prod-db.host:5432/showdeal
PROD_REDIS_URL=redis://:password@prod-redis.host:6379
PROD_JWT_SECRET=<generated-random-secret-32-chars>
PROD_JWT_CHALLENGE_SECRET=<generated-random-secret-32-chars>
```

---

## 🔄 Workflows Automatizados

### 1. **build-test.yml** (Automático en Push a `main` o `develop`)
- ✅ Lint código
- ✅ Build Docker image
- ✅ Ejecutar tests
- ✅ Security scanning (Trivy)
- 📢 Notifica en Slack

**Trigger:**
- `push` a `main` o `develop`
- `pull_request` a `main` o `develop`

---

### 2. **deploy-staging.yml** (Deploy a Staging)
- 🏗️ Build + Push imagen a DockerHub
- 🚀 Deploy a Railway/Render staging
- ✅ Smoke tests
- 📢 Notifica en Slack

**Trigger:**
- `push` a `develop` (automático)
- Manual: `workflow_dispatch` en Actions tab

---

### 3. **deploy-production.yml** (Deploy a Producción)
- 🏗️ Build + Push imagen optimizada
- 🚀 Deploy a Heroku/Railway producción
- ⏳ Health checks
- 🔄 Rollback automático si falla
- 📢 Crear GitHub Release
- 📢 Notifica en Slack

**Trigger:**
- `push` a `main` (automático para tagged releases)
- Manual: `workflow_dispatch` en Actions tab

---

## 🚀 Generar Secrets Seguros

```bash
# En terminal/PowerShell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Resultado ejemplo:
# a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6

# Copiar este valor a GitHub Secrets
```

---

## 📋 Checklist de Setup

- [ ] Crear cuenta DockerHub si no la tienes
- [ ] Generar Personal Access Token en DockerHub
- [ ] Generar Heroku API Key (opcional)
- [ ] Generar Railway tokens (opcional)
- [ ] Configurar Slack webhook (opcional)
- [ ] Agregar todos los secrets en GitHub
- [ ] Hacer push a `develop` para trigger staging
- [ ] Hacer push a `main` para trigger producción
- [ ] Monitorear Actions tab para logs de deployment

---

## 🔍 Monitor de Workflows

### En GitHub
1. Ir a **Actions** tab
2. Ver workflows ejecutándose
3. Hacer clic para ver logs detallados

### En Slack (si está configurado)
- Notificaciones automáticas de build/deploy
- Status de jobs: ✅ Success o ❌ Failure

### En Docker Hub
- Nueva imagen pusheada automáticamente
- Vista: https://hub.docker.com/r/YOUR_USERNAME/showdeal

---

## 🐛 Troubleshooting Workflows

### Workflow no triggered
```
Verificar:
1. Rama empuja a 'develop' o 'main'
2. Cambios en 'App/' o '.github/workflows/'
3. Workflow archivos sin errores de YAML
```

### Build fallido
```
Ver logs:
1. Click en workflow en Actions tab
2. Buscar paso que falló
3. Ver output del error
4. Típicamente:
   - npm install failed: Verificar package-lock.json
   - Docker build failed: Ver Dockerfile
   - Tests failed: Ver test logs
```

### Secret not found
```
Verificar:
1. Secret existe en Settings > Secrets
2. Nombre del secret es exacto (case-sensitive)
3. Contrasena/token válido
```

### Heroku deploy fallido
```
Pasos:
1. Verificar HEROKU_API_KEY válida
2. App name exacto
3. Verificar que Heroku app existe
```

---

## 🔐 Security Best Practices

1. **Secrets seguros**
   - NO commitear .env a Git
   - Regenerar secrets periódicamente
   - Usar diferentes secrets para staging/prod

2. **Imagen Docker**
   - Multi-stage build (más pequeña, más segura)
   - Non-root user
   - Health check incluido

3. **Database**
   - Usar DB URLs de cada ambiente
   - Backups automatizados
   - No exponer credenciales en logs

4. **Access Control**
   - Branch protection en main
   - Require status checks before merge
   - Require approvals for production

---

## 📈 Monitoring Producción

### Health Checks
```bash
# Verificar que API está healthy
curl https://showdeal.com/health

# Respuesta esperada:
# {"status":"ok","timestamp":"...","uptime":12345}
```

### Logs
```bash
# Heroku
heroku logs --tail -a showdeal-prod

# Railway
railway logs

# Docker Hub (ver descargas)
https://hub.docker.com/r/YOUR_USERNAME/showdeal
```

### Metrics
- GitHub Actions: Tiempo de build/deploy
- Docker Hub: Tamaño de imagen, descargas
- Heroku/Railway: CPU, memoria, uptime

---

## 📚 Referencias

- GitHub Actions: https://docs.github.com/en/actions
- Docker Hub: https://docs.docker.com/docker-hub/
- Heroku Deployment: https://devcenter.heroku.com/articles/container-registry-and-runtime
- Railway: https://docs.railway.app/
- Slack Webhooks: https://api.slack.com/messaging/webhooks

