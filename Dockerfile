# Multi-stage Dockerfile para showDeal - Node.js 18 Alpine
# Imagen optimizada para producción: ~150MB

# Stage 1: Dependencies
FROM node:18-alpine AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Stage 2: DevDependencies (para build si es necesario)
FROM node:18-alpine AS devdependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Stage 3: Builder (genera clientes Prisma, prepara la app)
FROM devdependencies AS builder
WORKDIR /app
COPY prisma ./prisma
COPY src ./src
COPY public ./public
# Generar cliente Prisma
RUN npx prisma generate

# Stage 4: Production Runtime
FROM node:18-alpine AS runtime
LABEL maintainer="ShowDeal <dev@showdeal.com>"
LABEL version="1.0"
LABEL description="ShowDeal API - Production Container"

# Instalar dumb-init para manejo correcto de señales
RUN apk add --no-cache dumb-init postgresql-client

WORKDIR /app

# Crear usuario no-root para seguridad
RUN addgroup -g 1001 -S nodejs \
    && adduser -S nodejs -u 1001

# Copiar node_modules desde dependencies stage
COPY --from=dependencies --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copiar prisma schema y cliente generado
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nodejs:nodejs /app/node_modules/.prisma ./node_modules/.prisma

# Copiar código de la aplicación
COPY --chown=nodejs:nodejs src ./src
COPY --chown=nodejs:nodejs public ./public
COPY --chown=nodejs:nodejs package*.json ./

# Crear volumenes para uploads
RUN mkdir -p /app/uploads && chown -R nodejs:nodejs /app/uploads

# Cambiar a usuario no-root
USER nodejs

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV PORT=3000
ENV LOG_LEVEL=info

# Exponer puerto
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node /app/healthcheck.js || exit 1

# Copiar script de health check
COPY --chown=nodejs:nodejs healthcheck.js ./

# Usar dumb-init para iniciar el proceso
ENTRYPOINT ["/usr/sbin/dumb-init", "--"]

# Comando por defecto
CMD ["node", "src/server.js"]

