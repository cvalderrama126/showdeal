---
name: DevOps Guidelines
description: |
  Instrucciones para DevOps, CI/CD, containerización y deployment en showDeal.
  Aplica automáticamente a archivos de configuración, workflows y scripts de deployment.
---

# Guía DevOps para ShowDeal

## Docker Setup

### Dockerfile (Production)
```dockerfile
# Multi-stage build for optimization
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Final stage
FROM node:18-alpine

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Copy from builder
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs . .

# Switch to non-root user
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node docker/healthcheck.js

EXPOSE 3000

CMD ["node", "src/server.js"]
```

### Dockerfile.dev (Development)
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
```

### docker-compose.yml
```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.dev
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: development
      DATABASE_URL: postgresql://showdeal:password@postgres:5432/showdeal
      JWT_SECRET: dev-secret-key
    volumes:
      - .:/app
      - /app/node_modules
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - showdeal-network

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: showdeal
      POSTGRES_USER: showdeal
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./docker/init-db.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U showdeal"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - showdeal-network

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    networks:
      - showdeal-network

volumes:
  postgres_data:
  redis_data:

networks:
  showdeal-network:
    driver: bridge
```

### .dockerignore
```
node_modules
npm-debug.log
.git
.gitignore
.env
.env.local
.vscode
.idea
dist
build
.next
uploads
```

## GitHub Actions CI/CD

### .github/workflows/build-test.yml
```yaml
name: Build & Test

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  build:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15-alpine
        env:
          POSTGRES_DB: showdeal_test
          POSTGRES_USER: showdeal
          POSTGRES_PASSWORD: password
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run linter
        run: npm run lint --if-present

      - name: Run tests
        run: npm test
        env:
          DATABASE_URL: postgresql://showdeal:password@localhost:5432/showdeal_test

      - name: Build Docker image
        run: docker build -t showdeal:${{ github.sha }} .

      - name: Test Docker image
        run: |
          docker run --rm \
            -e NODE_ENV=test \
            showdeal:${{ github.sha }} \
            npm test

      - name: Scan image for vulnerabilities
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: showdeal:${{ github.sha }}
          format: 'sarif'
          output: 'trivy-results.sarif'

      - name: Upload Trivy results
        uses: github/codeql-action/upload-sarif@v2
        with:
          sarif_file: 'trivy-results.sarif'
```

### .github/workflows/deploy-staging.yml
```yaml
name: Deploy to Staging

on:
  push:
    branches: [develop]

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Login to Docker Hub
        uses: docker/login-action@v2
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}

      - name: Build and push
        uses: docker/build-push-action@v4
        with:
          context: .
          push: true
          tags: |
            ${{ secrets.DOCKER_USERNAME }}/showdeal:staging-latest
            ${{ secrets.DOCKER_USERNAME }}/showdeal:staging-${{ github.sha }}
          cache-from: type=registry,ref=${{ secrets.DOCKER_USERNAME }}/showdeal:staging-latest

      - name: Deploy to Railway (Staging)
        run: |
          curl -X POST https://api.railway.app/deploy \
            -H "Authorization: Bearer ${{ secrets.RAILWAY_TOKEN }}" \
            -H "Content-Type: application/json" \
            -d '{
              "environmentId": "${{ secrets.RAILWAY_STAGING_ENV }}",
              "serviceId": "${{ secrets.RAILWAY_SERVICE_ID }}",
              "image": "${{ secrets.DOCKER_USERNAME }}/showdeal:staging-${{ github.sha }}"
            }'

      - name: Health check
        run: |
          for i in {1..30}; do
            if curl -f https://staging.showdeal.app/health; then
              echo "Health check passed"
              exit 0
            fi
            echo "Attempt $i: Waiting for deployment..."
            sleep 10
          done
          echo "Health check failed"
          exit 1

      - name: Notify Slack
        if: always()
        uses: slackapi/slack-github-action@v1.24.0
        with:
          webhook-url: ${{ secrets.SLACK_WEBHOOK }}
          payload: |
            {
              "text": "Deployment to Staging: ${{ job.status }}",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Staging Deployment*\nStatus: ${{ job.status }}\nCommit: ${{ github.sha }}"
                  }
                }
              ]
            }
```

### .github/workflows/deploy-production.yml
```yaml
name: Deploy to Production

on:
  release:
    types: [published]

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production

    steps:
      - uses: actions/checkout@v3

      - name: Login to Docker Hub
        uses: docker/login-action@v2
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}

      - name: Build and push
        uses: docker/build-push-action@v4
        with:
          context: .
          push: true
          tags: |
            ${{ secrets.DOCKER_USERNAME }}/showdeal:latest
            ${{ secrets.DOCKER_USERNAME }}/showdeal:${{ github.ref_name }}
          cache-from: type=registry,ref=${{ secrets.DOCKER_USERNAME }}/showdeal:latest

      - name: Database backup (Production)
        run: |
          BACKUP_FILE="showdeal_backup_$(date +%Y%m%d_%H%M%S).sql"
          pg_dump ${{ secrets.DATABASE_URL }} > $BACKUP_FILE
          # Upload to S3 or backup service
          aws s3 cp $BACKUP_FILE s3://${{ secrets.AWS_BACKUP_BUCKET }}/

      - name: Deploy to Railway (Production)
        run: |
          curl -X POST https://api.railway.app/deploy \
            -H "Authorization: Bearer ${{ secrets.RAILWAY_PROD_TOKEN }}" \
            -H "Content-Type: application/json" \
            -d '{
              "environmentId": "${{ secrets.RAILWAY_PROD_ENV }}",
              "serviceId": "${{ secrets.RAILWAY_SERVICE_ID }}",
              "image": "${{ secrets.DOCKER_USERNAME }}/showdeal:${{ github.ref_name }}"
            }'

      - name: Run database migrations
        run: |
          npm run prisma:migrate -- --skip-generate

      - name: Health check
        run: |
          for i in {1..30}; do
            if curl -f https://showdeal.app/health; then
              echo "Health check passed"
              exit 0
            fi
            echo "Attempt $i: Waiting for deployment..."
            sleep 10
          done
          exit 1

      - name: Smoke tests
        run: npm run test:smoke

      - name: Notify on success
        uses: slackapi/slack-github-action@v1.24.0
        with:
          webhook-url: ${{ secrets.SLACK_WEBHOOK }}
          payload: |
            {
              "text": "✅ Production Deployment Successful",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Production Deployment Successful*\nRelease: ${{ github.ref_name }}\nCommit: ${{ github.sha }}"
                  }
                }
              ]
            }

      - name: Rollback on failure
        if: failure()
        run: |
          echo "Deployment failed. Rolling back..."
          # Rollback script
          ./scripts/rollback.sh ${{ secrets.RAILWAY_PROD_TOKEN }}
```

## Environment Variables Management

### .env.example
```bash
# Application
NODE_ENV=development
PORT=3000
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/showdeal

# Authentication
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRY=24h
OTP_EXPIRY=300

# File Upload
UPLOAD_DIR=/uploads
MAX_FILE_SIZE=10485760
ALLOWED_EXTENSIONS=jpg,jpeg,png,pdf,xlsx

# External Services (optional)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=xxxxx
AWS_SECRET_ACCESS_KEY=xxxxx

# Monitoring
SENTRY_DSN=https://xxxxx@sentry.io/xxxxx
```

### Secrets in GitHub
```
DOCKER_USERNAME
DOCKER_PASSWORD
DATABASE_URL
JWT_SECRET
SLACK_WEBHOOK
RAILWAY_TOKEN
AWS_BACKUP_BUCKET
```

## Health Check Script

### docker/healthcheck.js
```javascript
const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/health',
  method: 'GET',
  timeout: 5000,
};

const req = http.request(options, (res) => {
  if (res.statusCode === 200) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});

req.on('error', () => process.exit(1));
req.on('timeout', () => process.exit(1));
req.end();
```

### Health Check Endpoint
```javascript
// src/routes/health.js
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
  });
});
```

## Deployment Checklist

- [ ] Código testeado localmente
- [ ] Tests pasando (git pre-hooks)
- [ ] Database migrations probar localmente
- [ ] Variables de entorno configuradas
- [ ] Secrets no hardcoded
- [ ] Docker image builds sin errores
- [ ] Health check configurado
- [ ] Monitoring/logs activos
- [ ] Rollback script funcionando
- [ ] Backups configurados
- [ ] Notificaciones Slack configuradas
- [ ] Team notificado del deploy

## Debugging en Production

### Logs desde Heroku
```bash
heroku logs --tail --app showdeal-prod
heroku logs --source app --tail --app showdeal-prod
```

### Database en Production
```bash
heroku pg:psql --app showdeal-prod
```

### Scale Dynos
```bash
heroku ps:scale web=2 --app showdeal-prod
heroku ps:scale worker=1 --app showdeal-prod
```

### Restart
```bash
heroku restart --app showdeal-prod
```

## Cost Optimization

- [ ] Use Alpine Linux images (smaller = cheaper)
- [ ] Layer caching en Docker
- [ ] Database connection pooling
- [ ] CDN para assets estáticos
- [ ] Auto-scaling based on metrics
- [ ] Delete old Docker images
- [ ] Use spot instances si aplica
- [ ] Reserved instances para producción

## Security Best Practices

- [ ] Secrets en GitHub Actions, no en repo
- [ ] No usar `latest` tag en producción
- [ ] Private Docker registries
- [ ] HTTPS everywhere
- [ ] Rate limiting en APIs públicas
- [ ] DDoS protection (CloudFlare)
- [ ] Security headers (Helmet.js)
- [ ] Audit logs de cambios
- [ ] Dependencia scanning (Dependabot)
- [ ] Image scanning (Trivy)
