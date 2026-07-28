# Analisis de Vulnerabilidades - ShowDeal

Fecha: 2026-06-17  
Alcance: revision white-box del repositorio local, enfocada en autenticacion, autorizacion, CSRF/CORS, criptografia, CRUD, adjuntos, frontend y dependencias.

## Resumen ejecutivo

La aplicacion mantiene una base defensiva solida: `helmet` con CSP, CORS con lista blanca, CSRF double-submit, JWT en cookie `HttpOnly`, rate limiting, sanitizacion de errores, validacion de inputs y Prisma como capa de acceso a datos. Las verificaciones automaticas recientes tambien son positivas:

- `npm audit --json`: 0 vulnerabilidades conocidas.
- `npm run test:security -- --runInBand`: 15/15 pruebas pasaron.
- `npm run lint`: sin errores.

El riesgo mas importante encontrado es un bypass de ownership en el listado de adjuntos (`r_attach`) cuando el usuario envia `id_asset` por query string. Esto puede permitir enumerar metadatos de adjuntos asociados a activos de otra compania.

## Hallazgos priorizados

### P1 - Bypass de ownership en listado de adjuntos

Archivo: `App/src/attachments/attachment.service.js`

En `buildWhereClause`, primero se aplica el filtro de activos permitidos:

```js
where.id_asset = { in: allowedAssetIds };
```

Pero luego, si llega `id_asset` en query, se sobrescribe:

```js
if (id_asset) {
  where.id_asset = id_asset;
}
```

Impacto:

Un usuario no administrador con permiso `r_attach.read` podria solicitar:

```text
GET /api/r_attach?id_asset=<asset_ajeno>
```

y saltarse el filtro por compania. La descarga directa sigue protegida por `requireOwnership("r_attach")`, pero el listado puede filtrar metadatos como `id_attach`, `file_name`, `mime_type`, `file_hash`, `asset_uin`, `asset_status` y `download_url`.

Recomendacion:

- No sobrescribir `where.id_asset` cuando exista `allowedAssetIds`.
- Combinar ambos filtros con interseccion: si `id_asset` no pertenece a `allowedAssetIds`, responder lista vacia o 403.
- Si el usuario no es admin y no trae `companyId`, usar `allowedAssetIds = []` o responder 403.
- Agregar prueba especifica para `GET /api/r_attach?id_asset=<asset_ajeno>`.

### P2 - Fuga menor en opciones de adjuntos

Archivo: `App/src/attachments/attachment.service.js`

`listAttachmentOptions` filtra correctamente los assets visibles por compania, pero `attachmentTypes` se obtiene globalmente:

```js
prisma.r_attach.findMany({
  distinct: ["tp_attach"],
  orderBy: { tp_attach: "asc" },
  select: { tp_attach: true },
})
```

Impacto:

Un usuario podria ver tipos de documentos usados por otras companias, aunque no acceda al archivo.

Recomendacion:

Filtrar `attachmentTypes` por los mismos activos permitidos que `assets`.

### P2 - Politica de cambio de contrasena inconsistente

Archivo: `App/src/auth/auth.routes.js`

`passwordChangeSchema` y `passwordForcedSchema` solo exigen longitud minima de 8 caracteres:

```js
newPassword: z.string().min(8, "New password must be at least 8 characters")
```

Impacto:

Permite contrasenas debiles como `aaaaaaaa`, aunque otros flujos del sistema usan una politica mas fuerte.

Recomendacion:

Unificar la politica con password reset:

- minimo 8 caracteres;
- maximo 128;
- al menos una minuscula;
- al menos una mayuscula;
- al menos un numero.

### P3 - `verifyHMAC` puede lanzar excepcion con input invalido

Archivo: `App/src/utils/crypto.utils.js`

`verifyHMAC` usa `crypto.timingSafeEqual` sin validar longitud/formato del HMAC recibido:

```js
return crypto.timingSafeEqual(
  Buffer.from(expected, 'hex'),
  Buffer.from(hmac, 'hex')
);
```

Impacto:

Actualmente el helper no parece estar expuesto en rutas, pero si se usa en el futuro con input externo podria provocar errores 500 ante HMAC malformados.

Recomendacion:

Validar que `hmac` sea string hexadecimal de 64 caracteres antes de comparar. Si no cumple, devolver `false`.

## Controles positivos observados

- JWT no se expone en respuesta en produccion aunque `EXPOSE_JWT_IN_RESPONSE=1`.
- Sesion en cookie `HttpOnly`, `SameSite=strict` y `secure` en produccion.
- CSRF double-submit activo para rutas mutables.
- Setup en produccion falla cerrado si no hay `SETUP_TOKEN`.
- Secretos OTP cifrados en BD con `OTP_ENCRYPTION_KEY` o fallback.
- `.env.docker` y `docker-compose.staging.yml` ya no contienen secretos funcionales; usan placeholders o variables requeridas.
- Uploads con limite de tamano y validacion de MIME/extension/magic bytes.
- CRUD generico con whitelist de campos y parametros.

## Plan de remediacion recomendado

1. Corregir el bypass de `r_attach` combinando `id_asset` con `allowedAssetIds`.
2. Agregar tests de aislamiento multi-compania para `r_attach`.
3. Filtrar `attachmentTypes` por compania.
4. Unificar politica de contrasenas.
5. Endurecer `verifyHMAC`.
6. Mantener `npm audit`, `test:security` y `lint` como gate antes de despliegue.

## Estado del repositorio

Durante la revision se observo un cambio local no relacionado en:

```text
App/node_modules/.package-lock.json
```

No fue modificado por este analisis.
