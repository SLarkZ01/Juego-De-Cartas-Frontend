# 🚀 Instrucciones Rápidas - Fix Middleware

## ⚠️ IMPORTANTE: Debes limpiar tu sesión actual

El fix requiere que **vuelvas a hacer login** para que se creen las cookies necesarias.

## 📋 Pasos para Aplicar el Fix

### 1️⃣ Limpiar Sesión Actual

Abre **DevTools Console** (F12) y ejecuta:

```javascript
// Limpiar todo
localStorage.clear();
document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax';

// Recargar página
location.reload();
```

### 2️⃣ Volver a Hacer Login

```
1. Ve a http://localhost:3000/login
2. Ingresa tus credenciales
3. Click en "Iniciar Sesión"
4. ✅ Deberías ser redirigido a /jugar
```

### 3️⃣ Verificar que Funciona

```
Opción A - Desde la página principal:
1. Ve a http://localhost:3000 (estando logueado)
2. Click en "🎮 ¡A jugar!"
3. ✅ Deberías entrar a /jugar SIN ser redirigido a /login

Opción B - Navegación directa:
1. Escribe manualmente en el navegador: http://localhost:3000/jugar
2. ✅ Deberías entrar directamente SIN ser redirigido a /login
```

### 4️⃣ Verificar Cookies (Opcional)

En **DevTools Console**:

```javascript
// Ver cookie
document.cookie
// Deberías ver algo como: "token=Bearer eyJhbGciOiJIUzI1..."

// Ver localStorage
localStorage.getItem('token')
// Deberías ver: "Bearer eyJhbGciOiJIUzI1..."
```

## 🎯 ¿Qué se arregló?

### ❌ Antes (PROBLEMA)
```
Login exitoso → Token guardado SOLO en localStorage → 
Intentar ir a /jugar → Middleware NO puede leer localStorage → 
Redirige a /login ❌
```

### ✅ Después (ARREGLADO)
```
Login exitoso → Token guardado en localStorage + Cookies → 
Intentar ir a /jugar → Middleware lee cookie → 
Permite acceso ✅
```

## 🔧 Cambios Técnicos

1. **Auth Service**: Ahora guarda el token en cookies además de localStorage
2. **Middleware**: Simplificado para leer SOLO de cookies (que sí están disponibles en el servidor)
3. **Logout**: Limpia tanto localStorage como cookies

## 🐛 Si No Funciona

### Problema: Sigo siendo redirigido a /login

**Solución**:
```javascript
// 1. Asegúrate de limpiar TODO
localStorage.clear();
document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';

// 2. Cierra todas las pestañas del localhost:3000

// 3. Abre nueva pestaña y haz login de nuevo
```

### Problema: No veo la cookie

**Verificar**:
1. Abre DevTools → Application tab
2. Ve a "Cookies" en el sidebar izquierdo
3. Click en "http://localhost:3000"
4. Deberías ver una cookie llamada "token"

### Problema: Backend rechaza las peticiones

**Verificar CORS en el backend**:
```java
// El backend debe permitir cookies:
@CrossOrigin(
  origins = "http://localhost:3000",
  allowCredentials = "true" // ← Importante
)
```

## ✅ Checklist de Verificación

Después de hacer login, verifica:

- [ ] La cookie "token" existe (DevTools → Application → Cookies)
- [ ] localStorage tiene el token
- [ ] Puedes ir a /jugar sin ser redirigido
- [ ] Puedes crear una partida
- [ ] Puedes unirte a una partida
- [ ] Al hacer logout, tanto cookie como localStorage se limpian

## 📞 Archivos Modificados

- `services/auth.service.ts` - Guarda/limpia cookies
- `middleware.ts` - Lee solo de cookies
- `docs/FIX_MIDDLEWARE_COOKIES.md` - Documentación detallada

---

**💡 Tip**: Siempre que hagas cambios en el sistema de autenticación, limpia la sesión actual y vuelve a hacer login para aplicar los cambios.

**🎮 Estado**: ✅ LISTO PARA PROBAR
