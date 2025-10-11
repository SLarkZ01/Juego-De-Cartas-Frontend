# 🔧 Fix: Middleware y Autenticación con Cookies

## 🐛 Problema Reportado

**Usuario reporta**: "Cuando he iniciado sesión y le doy a jugar me envía al login. No debería pasar. Me debería llevar a crear o unirme a una partida no?"

## 🔍 Análisis del Problema

### Causa Raíz
El middleware de Next.js se ejecuta en el **servidor** (edge runtime), donde **NO tiene acceso** a:
- `localStorage`
- `sessionStorage`
- Objetos del navegador

Sin embargo, nuestra implementación guardaba el token JWT **SOLO en localStorage**:

```typescript
// ❌ Implementación anterior (solo localStorage)
localStorage.setItem('token', authData.token);
```

El middleware intentaba leer el token:
```typescript
// ❌ No funciona - localStorage no existe en el servidor
const token = request.cookies.get('token')?.value || 
              localStorage.getItem('token'); // <- Siempre null en servidor
```

**Resultado**: El middleware siempre pensaba que el usuario NO estaba autenticado y lo redirigía a `/login`.

## ✅ Solución Implementada

### Estrategia: Doble Persistencia (localStorage + Cookies)

Ahora guardamos el token en **DOS lugares**:

1. **localStorage**: Para el cliente (React components, axios interceptors)
2. **Cookies HTTP**: Para el servidor (middleware de Next.js)

### Cambios Realizados

#### 1. `services/auth.service.ts` - Guardar en ambos lugares

```typescript
private saveAuthData(authData: AuthResponse): void {
  if (typeof window === 'undefined') return;
  
  // 1. Guardar en localStorage (para cliente)
  localStorage.setItem(AuthService.TOKEN_KEY, authData.token);
  localStorage.setItem(AuthService.USER_KEY, JSON.stringify(authData));
  
  // 2. Guardar en cookies (para middleware/servidor)
  const expirationDays = 7;
  const date = new Date();
  date.setTime(date.getTime() + (expirationDays * 24 * 60 * 60 * 1000));
  const expires = `expires=${date.toUTCString()}`;
  
  document.cookie = `token=${authData.token}; ${expires}; path=/; SameSite=Lax`;
}
```

**Atributos de la cookie**:
- `expires`: Cookie expira en 7 días
- `path=/`: Disponible en todas las rutas
- `SameSite=Lax`: Protección CSRF básica

#### 2. `services/auth.service.ts` - Limpiar ambos en logout

```typescript
private clearAuthData(): void {
  if (typeof window === 'undefined') return;
  
  // 1. Limpiar localStorage
  localStorage.removeItem(AuthService.TOKEN_KEY);
  localStorage.removeItem(AuthService.USER_KEY);
  
  // 2. Limpiar cookie (expiración en el pasado)
  document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax';
}
```

#### 3. `middleware.ts` - Leer solo de cookies

```typescript
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // ✅ Leer SOLO de cookies (disponible en servidor)
  const token = request.cookies.get('token')?.value;

  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route));
  const isAuthRoute = authRoutes.some(route => pathname.startsWith(route));

  // Proteger rutas que requieren autenticación
  if (isProtectedRoute && !token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Evitar acceso a login/register si ya está autenticado
  if (isAuthRoute && token) {
    return NextResponse.redirect(new URL('/jugar', request.url));
  }

  return NextResponse.next();
}
```

## 🔄 Flujo Completo de Autenticación

### Registro/Login
```
1. Usuario envía credenciales
   ↓
2. Backend responde con JWT token
   ↓
3. AuthService.saveAuthData() guarda:
   - localStorage['token'] = "Bearer ey..."
   - localStorage['user'] = "{id, username, ...}"
   - Cookie: token=Bearer ey...; expires=...; path=/
   ↓
4. Usuario intenta ir a /jugar
   ↓
5. Middleware lee: request.cookies.get('token')
   ↓
6. ✅ Token existe → Permite acceso a /jugar
```

### Logout
```
1. Usuario click en "Cerrar Sesión"
   ↓
2. AuthService.clearAuthData() limpia:
   - localStorage.removeItem('token')
   - localStorage.removeItem('user')
   - document.cookie = 'token=; expires=1970...' (expira cookie)
   ↓
3. Usuario intenta ir a /jugar
   ↓
4. Middleware lee: request.cookies.get('token')
   ↓
5. ❌ Token NO existe → Redirige a /login
```

## 📊 Comparación Antes/Después

| Aspecto | ❌ Antes | ✅ Después |
|---------|----------|------------|
| **Persistencia** | Solo localStorage | localStorage + Cookies |
| **Middleware funciona** | No (siempre redirige) | Sí (lee cookies) |
| **Acceso a /jugar** | Redirige a /login | Permite acceso |
| **Logout limpia** | Solo localStorage | Ambos lugares |
| **Expiración** | Manual | Automática (7 días) |

## 🧪 Cómo Verificar el Fix

### 1. Limpiar estado anterior
```javascript
// En DevTools Console
localStorage.clear();
document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';
location.reload();
```

### 2. Hacer login
```
1. Ir a http://localhost:3000/login
2. Ingresar credenciales
3. Verificar redirección a /jugar
```

### 3. Verificar cookies
```javascript
// En DevTools Console
document.cookie // Deberías ver: "token=Bearer ey..."
```

### 4. Verificar localStorage
```javascript
// En DevTools Console
localStorage.getItem('token') // Deberías ver: "Bearer ey..."
```

### 5. Probar navegación
```
1. Estando logueado, ir manualmente a /jugar
2. ✅ Deberías entrar sin problemas
3. NO debería redirigir a /login
```

### 6. Probar logout
```
1. Cerrar sesión
2. Verificar que cookie se limpió:
   document.cookie // NO debería tener "token"
3. Intentar ir a /jugar
4. ✅ Debería redirigir a /login
```

## 🔐 Consideraciones de Seguridad

### Cookies vs localStorage

| Aspecto | localStorage | Cookies |
|---------|--------------|---------|
| **Accesible desde** | Solo JavaScript | JavaScript + HTTP |
| **Vulnerable a XSS** | Sí | Sí (sin HttpOnly) |
| **Enviado automático** | No | Sí |
| **Tamaño máximo** | ~5-10MB | ~4KB |
| **Expira** | Nunca (manual) | Sí (configurable) |

### Mejoras para Producción (Futuras)

```typescript
// Para producción, agregar estos atributos a las cookies:
document.cookie = `token=${token}; ` +
  `expires=${expires}; ` +
  `path=/; ` +
  `SameSite=Strict; ` +      // Más estricto contra CSRF
  `Secure; ` +               // Solo HTTPS
  `HttpOnly`;                // No accesible desde JS (más seguro)
```

**Nota**: `HttpOnly` requiere que las cookies se establezcan desde el servidor, no desde JavaScript del cliente.

## 📝 Archivos Modificados

1. ✅ `services/auth.service.ts`
   - `saveAuthData()` - Agrega cookie
   - `clearAuthData()` - Limpia cookie

2. ✅ `middleware.ts`
   - Simplificado para leer SOLO de cookies

## 🎯 Resultado Final

### ✅ Funcionamiento Correcto

```
Login/Registro → Guarda token en localStorage + Cookie → 
Usuario va a /jugar → Middleware lee cookie → 
✅ Token existe → Permite acceso → 
✅ Usuario puede crear/unirse a partida
```

### ❌ Ya NO Pasa

```
Login → Guarda SOLO en localStorage → 
Usuario va a /jugar → Middleware NO puede leer localStorage → 
❌ Middleware no encuentra token → 
❌ Redirige a /login (PROBLEMA ARREGLADO)
```

## 🚀 Próximos Pasos

1. **Limpiar sesión actual**: `localStorage.clear()` + recargar página
2. **Hacer login nuevamente**: Para que se creen las cookies
3. **Probar navegación a /jugar**: Ahora debería funcionar
4. **Crear/Unirse a partida**: El flujo completo debería funcionar

## 🐛 Debugging

### Si sigue sin funcionar:

```javascript
// 1. Verificar que la cookie se guardó
console.log('Cookie:', document.cookie);

// 2. Verificar localStorage
console.log('Token:', localStorage.getItem('token'));

// 3. Limpiar TODO y volver a intentar
localStorage.clear();
document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';
location.reload();

// 4. Hacer login de nuevo
```

### Si aparece error de CORS:

El backend debe permitir cookies desde el frontend:

```java
// En el backend (Spring Boot)
@CrossOrigin(
  origins = "http://localhost:3000",
  allowCredentials = "true" // ← Importante para cookies
)
```

---

**Fecha del fix**: 10 de octubre de 2025
**Problema**: Middleware redirigía a /login incluso estando autenticado
**Solución**: Guardar token en cookies además de localStorage
**Estado**: ✅ RESUELTO
