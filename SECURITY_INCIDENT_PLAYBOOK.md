# Security Incident Playbook (Post-Leak de Secretos)

Fecha: 2026-06-09  
Proyecto: ShowDeal  
Tipo de incidente: Exposición de secretos en historial Git

## Objetivo
Establecer un procedimiento operativo y auditable para contener, erradicar y verificar incidentes de exposición de secretos.

## Alcance
- Repositorio Git y su historial.
- Credenciales de aplicacion (JWT, challenge tokens).
- Credenciales de base de datos.
- Entornos local, QA, staging y produccion.

## Flujo de respuesta en 10 pasos

1. Contener filtracion activa
- Revocar inmediatamente secretos comprometidos (JWT, challenge secret, DB password).
- Remover archivos sensibles del tracking (`git rm --cached`) y validar `.gitignore`.
- Resultado esperado: ningun secreto comprometido sigue activo.

2. Rotar secretos criticos
- Generar nuevos secretos criptograficamente fuertes.
- Aplicar rotacion en todos los entornos y servicios dependientes.
- Resultado esperado: valores nuevos desplegados y en uso.

3. Limpiar historial Git
- Reescribir historial para eliminar archivos/paths sensibles.
- Publicar con force push controlado.
- Resultado esperado: `git rev-list --all -- .env App/.env` devuelve 0 en remoto.

4. Validar integridad del remoto
- Confirmar que `origin/main` no contiene archivos sensibles.
- Revisar refs y ramas importantes post-rewrite.
- Resultado esperado: historial limpio y ramas criticas disponibles.

5. Invalidar sesiones y tokens
- Forzar relogin de usuarios.
- Invalidar challenge tokens en curso y sesiones antiguas.
- Resultado esperado: no quedan sesiones emitidas con secretos previos.

6. Verificar conectividad y salud
- Probar login, OTP, reset de password y conexion DB.
- Probar endpoints criticos de negocio.
- Resultado esperado: sin regresiones funcionales tras rotacion.

7. Fortalecer configuracion de seguridad
- Mantener fallback legado deshabilitado en produccion (`ALLOW_LEGACY_SHA256_LOGIN=0`).
- Configurar proxy de confianza (`TRUST_PROXY=1` o valor equivalente del entorno).
- Mantener exposicion de stack deshabilitada (`ENABLE_DEBUG_ERRORS=0`).
- Resultado esperado: baseline seguro en runtime.

8. Registrar evidencia y trazabilidad
- Guardar hash/ID de commits aplicados.
- Guardar evidencia de validaciones (salidas de comandos, checks de API, estado de ramas).
- Resultado esperado: auditoria reproducible.

9. Comunicar a stakeholders
- Informar impacto, acciones realizadas, estado residual y riesgos remanentes.
- Notificar al equipo sobre resincronizacion obligatoria tras reescritura de historial.
- Resultado esperado: alineacion operativa y cero confusiones de ramas.

10. Cerrar incidente y prevenir recurrencia
- Ejecutar retrospectiva tecnica.
- Agregar controles preventivos: pre-commit secret scanning, CI secret scanning, politicas de branch protection.
- Resultado esperado: reduccion de probabilidad de reincidencia.

## Checklist tecnico de verificacion

- [ ] `git rev-list --all -- .env App/.env` en remoto devuelve 0
- [ ] `git show origin/main:.env` falla con archivo no encontrado
- [ ] Login + OTP funcionales
- [ ] Password reset funcional y sin corrupcion de `authentication`
- [ ] Conexion DB OK con password rotado
- [ ] Variables de hardening presentes en archivos de ejemplo
- [ ] Sin secretos reales en archivos versionados

## Comandos utiles

```bash
git fetch origin --prune
git rev-list origin/main -- .env App/.env
git show origin/main:.env
```

```bash
# Resincronizacion recomendada para colaboradores tras history rewrite
git fetch origin --prune
git checkout main
git reset --hard origin/main
```

## Responsables sugeridos
- Security Lead: coordina respuesta y cierre.
- Backend Lead: rotacion de secretos y validaciones funcionales.
- DevOps: despliegue seguro, variables de entorno y observabilidad.
- QA: smoke/regression post-rotacion.

## Criterio de cierre
El incidente se considera cerrado cuando:
- Secretos rotados y antiguos invalidados.
- Historial remoto saneado y verificado.
- Funcionalidad critica validada.
- Evidencia documentada y comunicacion completada.
