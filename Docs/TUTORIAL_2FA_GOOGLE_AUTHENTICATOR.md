# Tutorial 2FA con Google Authenticator en ShowDeal

## Objetivo
Guiar el registro y uso del doble factor de autenticacion (OTP) con Google Authenticator para usuarios de ShowDeal.

## Requisitos previos
- Tener usuario y contrasena validos en ShowDeal.
- Tener instalado Google Authenticator en el celular:
  - iOS: App Store
  - Android: Google Play
- Tener la hora del celular configurada automaticamente.

## Flujo A: Configuracion en primer ingreso

### Paso 1. Iniciar sesion
1. Ir a la pantalla de login de ShowDeal.
2. Ingresar usuario y contrasena.
3. Si el usuario requiere configuracion inicial, se muestra el modal de primer ingreso.

### Paso 2. Abrir seccion de 2FA
1. En el modal "Bienvenido - Configuracion Inicial Requerida", ubicar "Configurar Autenticacion de Dos Factores (2FA)".
2. Verificar que aparezcan:
   - Codigo secreto.
   - QR para escaneo.

### Paso 3. Registrar cuenta en Google Authenticator
1. Abrir Google Authenticator.
2. Tocar el boton +.
3. Elegir una opcion:
   - Escanear codigo QR (recomendado).
   - Ingresar clave de configuracion manualmente (codigo secreto).
4. Confirmar que la cuenta quede creada en la app.

### Paso 4. Validar OTP en ShowDeal
1. En ShowDeal, escribir el codigo de 6 digitos generado en la app.
2. Presionar "Validar y Continuar".
3. Si el codigo es correcto, el 2FA queda habilitado y el usuario continua el flujo normal.

## Flujo B: Login diario con OTP

### Paso 1. Login base
1. Entrar con usuario y contrasena en login.
2. ShowDeal redirige a la pantalla "Verificacion (OTP)".

### Paso 2. Verificar codigo
1. Abrir Google Authenticator.
2. Tomar el codigo de 6 digitos del usuario.
3. Ingresarlo en ShowDeal.
4. Presionar "Verificar y entrar".
5. Si es correcto, ShowDeal abre Home.

## Flujo C: Activar 2FA para un usuario existente (operacion admin)
1. Entrar al modulo de Usuarios.
2. Ubicar el usuario objetivo.
3. Usar la accion OTP para configurar/habilitar 2FA.
4. Compartir con el usuario final el procedimiento de escaneo y validacion (Flujo A, pasos 3 y 4).

## Errores frecuentes y solucion

### "Invalid OTP"
- Esperar al siguiente codigo (el OTP rota cada ~30 segundos).
- Verificar que el celular tenga hora automatica.
- Volver a escribir el codigo sin espacios.

### "No hay verificacion OTP pendiente"
- Volver al login.
- Reingresar usuario y contrasena para generar un challenge nuevo.

### "Too many OTP attempts"
- Esperar la ventana del rate limit y volver a intentar.
- Evitar multiples intentos con codigos vencidos.

## Buenas practicas
- Guardar el codigo secreto en un canal seguro durante el onboarding.
- No compartir capturas de pantalla del QR.
- Mantener un procedimiento de recuperacion de cuenta (admin) para perdida de dispositivo.
- En soporte, validar primero hora del dispositivo antes de resetear OTP.

## Checklist rapido de validacion
- [ ] Usuario pudo registrar la cuenta en Google Authenticator.
- [ ] ShowDeal acepta OTP de 6 digitos.
- [ ] En login posterior, solicita OTP y permite acceso.
- [ ] Usuario conoce procedimiento en caso de cambio/perdida de celular.
