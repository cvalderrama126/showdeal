# 🧪 USUARIOS DE PRUEBA - ShowDeal API

## 📋 Tabla de Usuarios

| # | Username | Password | Rol | Permisos |
|---|----------|----------|-----|----------|
| 1 | `admin` | `password123` | **Root** | ✅ Acceso total (Administrador) |
| 2 | `supervisor` | `password123` | **Supervisor** | ✅ Supervisar operaciones |
| 3 | `auctioneer` | `password123` | **Auctioneer** | ✅ Gestionar subastas |
| 4 | `buyer` | `password123` | **Buyer** | ✅ Participar como comprador |
| 5 | `seller` | `password123` | **Seller** | ✅ Participar como vendedor |
| 6 | `auditor` | `password123` | **Auditor** | ✅ Auditar operaciones |
| 7 | `viewer` | `password123` | **Viewer** | ⚠️ Solo lectura |

---

## 🌐 Login vía Web

1. Abre: **http://localhost:3001**
2. Selecciona un usuario
3. Ingresa username y password
4. Haz clic en Login

---

## 🔑 Login vía API (curl)

### Admin (Acceso Total)
```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"user":"admin","password":"password123"}'
```

### Supervisor
```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"user":"supervisor","password":"password123"}'
```

### Auctioneer (Gestor de Subastas)
```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"user":"auctioneer","password":"password123"}'
```

### Buyer (Comprador)
```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"user":"buyer","password":"password123"}'
```

### Seller (Vendedor)
```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"user":"seller","password":"password123"}'
```

### Auditor (Auditor)
```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"user":"auditor","password":"password123"}'
```

### Viewer (Solo Lectura)
```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"user":"viewer","password":"password123"}'
```

---

## ✅ Respuesta Esperada

Si el login es exitoso, recibirás:

```json
{
  "ok": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "stage": "USER_LOGGEDIN",
  "user": {
    "login": "admin",
    "roleId": "1"
  }
}
```

---

## 🔐 Usar Token para Requests

Copia el `token` de la respuesta anterior y úsalo en tus requests:

```bash
curl http://localhost:3001/api/r_user \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## 🧪 Casos de Uso de Prueba

### 1. Probar Control de Acceso (IDOR)
- Login como **buyer**
- Intenta acceder a datos de **seller**
- Debe ser rechazado con error de autorización

### 2. Probar Permisos por Rol
- Login como **viewer**
- Intenta crear/editar/eliminar
- Debe ser rechazado (solo lectura)

### 3. Probar Escalada de Privilegios
- Login como **buyer**
- Intenta acceder a endpoints de **admin**
- Debe ser rechazado

### 4. Probar Flujo de Subastas
- Login como **auctioneer**
- Crear/modificar subastas
- Administrar eventos

### 5. Probar Operaciones de Activos
- Login como **seller**
- Crear activos para vender
- Participar en subastas

---

## ℹ️ Información Importante

| Parámetro | Valor |
|-----------|-------|
| **URL Base** | http://localhost:3001 |
| **Puerto** | 3001 |
| **BD** | PostgreSQL showdeal |
| **Password Hashing** | bcrypt (seguro) |
| **JWT Expiration** | 8 horas |
| **Rate Limit** | 5 intentos/15 min (login) |

---

## 🔄 Resetear Usuarios

Si necesitas resetear todos los usuarios de prueba, ejecuta:

```bash
cd d:\Proyectos\Freelance\showDeal\App
node scripts/setup-test-users.js
```

---

## ⚠️ Notas de Seguridad

✅ **Estos usuarios son SOLO para testing**
✅ Contraseña: `password123` en TODAS las cuentas
✅ No usar en producción
✅ Cambiar contraseñas antes de deployment
✅ Implementar 2FA/OTP para mayor seguridad

---

*Creado: 19 de Abril 2026 - ShowDeal API v1.0.0*