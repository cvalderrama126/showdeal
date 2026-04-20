# Referencia Rápida - Comandos Docker ShowDeal

## 🚀 Inicio Rápido

```bash
cd showDeal/App
docker-compose up -d
```

## 📊 Estado de Servicios

```bash
# Ver estado
docker-compose ps

# Ver logs en vivo (CTRL+C para salir)
docker-compose logs -f

# Solo app
docker-compose logs -f app

# Solo database
docker-compose logs -f postgres

# Solo redis
docker-compose logs -f redis
```

## 🔧 Container Management

```bash
# Entrar a shell de app
docker-compose exec app sh

# Entrar a PostgreSQL
docker-compose exec postgres psql -U showdeal -d showdeal

# Entrar a Redis
docker-compose exec redis redis-cli

# Ejecutar comando en app
docker-compose exec app npm run test:modules

# Rebuild imagen
docker-compose up -d --build

# Detener servicios
docker-compose down

# Detener y eliminar volúmenes (⚠️ borra BD)
docker-compose down -v
```

## 🗄️ Database

```bash
# Conectar a BD (desde host)
psql -h localhost -U showdeal -d showdeal
# Password: showdeal_dev_password

# Backup BD
docker-compose exec postgres pg_dump -U showdeal showdeal > backup.sql

# Restore BD
cat backup.sql | docker-compose exec -T postgres psql -U showdeal showdeal
```

## 💾 Prisma ORM

```bash
# Generar cliente
docker-compose exec app npx prisma generate

# Ver status de migraciones
docker-compose exec app npx prisma migrate status

# Abrir Prisma Studio (UI)
docker-compose exec app npx prisma studio
# http://localhost:5555

# Reset BD (⚠️ borra datos)
docker-compose exec app npx prisma migrate reset
```

## 🐳 Docker Image

```bash
# Ver imágenes
docker images | grep showdeal

# Tamaño de imagen
docker images showdeal --format "table {{.Repository}}\t{{.Size}}"

# Build manual
docker build -t showdeal:latest .

# Tag para registry
docker tag showdeal:latest yourusername/showdeal:1.0.0

# Push a Docker Hub
docker login
docker push yourusername/showdeal:1.0.0

# Limpiar imágenes sin usar
docker image prune -a
```

## 🧹 Limpieza

```bash
# Ver todo lo que usa Docker
docker system df

# Limpiar todo
docker system prune -a

# Eliminar volúmenes no usados
docker volume prune

# Eliminar específico
docker volume rm showdeal_postgres_data
```

## 🐛 Troubleshooting

```bash
# Verificar salud de servicios
curl http://localhost:3000/health

# Ver recursos usados
docker stats

# Ver detalles de contenedor
docker inspect showdeal-api

# Ver red Docker
docker network ls

# Verificar logs completos
docker-compose logs postgres | tail -100
```

## 📦 BuildX (Multi-platform builds)

```bash
# Build para linux/amd64 y linux/arm64
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t yourusername/showdeal:latest \
  --push .
```

## 🔒 Security

```bash
# Scan imagen por vulnerabilidades
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy image showdeal:latest

# Ver usuarios en imagen
docker run --rm showdeal:latest id

# Verificar permisos
docker run --rm showdeal:latest ls -la /app
```

## 🌐 Network

```bash
# Ver redes
docker network ls

# Inspeccionar network
docker network inspect showdeal-network

# Conectar contenedor a network
docker network connect showdeal-network container_name

# Desconectar
docker network disconnect showdeal-network container_name
```

## 💡 Tips

- **Desarrollo rápido**: Volúmenes mapeados en `docker-compose.yml` permiten hot-reload
- **Debug**: Ver `DOCKER.md` para Debug con Node Inspector
- **Producción**: Usar variables de entorno seguras, NO `.env` archivos
- **Performance**: Limitar CPU/memoria en `docker-compose.yml`
- **Health**: Siempre incluir health checks en `docker-compose.yml`

---

**Para más información, ver:** `DOCKER.md` e `GITHUB_ACTIONS_SETUP.md`
