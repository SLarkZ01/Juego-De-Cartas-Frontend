# 🎯 Comandos Rápidos para Pruebas

## 🚀 Iniciar la Aplicación

```bash
# Instalar dependencias (si es primera vez)
npm install

# Iniciar servidor de desarrollo
npm run dev
```

La aplicación estará disponible en: **http://localhost:3000**

## 🧪 Flujo de Pruebas Recomendado

### 1️⃣ Primera Prueba - Registro de Usuario Nuevo
```
1. Abrir: http://localhost:3000
2. Click en "Registrarse ✨"
3. Llenar formulario:
   - Usuario: tu_nombre (3-20 caracteres)
   - Email: tu@email.com
   - Password: 123456 (mínimo 6 caracteres)
   - Confirmar Password: 123456
4. Click "Registrarse"
5. ✅ DEBE redirigir a /jugar automáticamente
```

### 2️⃣ Segunda Prueba - Login con Usuario Existente
```
1. Cerrar sesión (si estás logueado)
2. Ir a: http://localhost:3000/login
3. Ingresar credenciales
4. Click "Iniciar Sesión"
5. ✅ DEBE redirigir a /jugar automáticamente
```

### 3️⃣ Tercera Prueba - Navegación desde Home
```
1. Login exitoso
2. Ir a: http://localhost:3000
3. Ver mensaje: "¡Bienvenido, TU_NOMBRE! 🎮"
4. Click en "¡A jugar! 🎮"
5. ✅ DEBE ir a /jugar
```

### 4️⃣ Cuarta Prueba - Crear Partida
```
1. Estar en /jugar
2. Click en "Crear Partida"
3. Ver código generado
4. ✅ DEBE mostrar código de 6 dígitos
```

### 5️⃣ Quinta Prueba - Unirse a Partida
```
1. Estar en /jugar
2. Click en "Unirse a Partida"
3. Ingresar código de 6 dígitos
4. Click "Unirse"
5. ✅ DEBE redirigir a /partida/[codigo]
```

### 6️⃣ Sexta Prueba - WebSocket en Partida
```
1. Entrar a una partida
2. Abrir DevTools > Console
3. Buscar mensaje: "WebSocket connected to game"
4. ✅ DEBE conectarse automáticamente
```

## 🔍 Verificación en DevTools

### Verificar Token JWT
```javascript
// En DevTools Console:
localStorage.getItem('token')
// Debería mostrar: "Bearer eyJhbGciOiJIUzI1..."
```

### Verificar Usuario Actual
```javascript
// En DevTools Console:
localStorage.getItem('user')
// Debería mostrar: '{"id":1,"username":"tu_nombre",...}'
```

### Limpiar Sesión (si necesitas logout manual)
```javascript
// En DevTools Console:
localStorage.clear()
location.reload()
```

## 🐛 Debugging - Problemas Comunes

### Problema: "Failed to fetch"
```bash
# Verificar que el backend esté corriendo
# URL esperada: http://localhost:8080

# Verificar CORS en el backend
# Debe permitir: http://localhost:3000
```

### Problema: "Token inválido" / 401 Unauthorized
```bash
# Limpiar localStorage y volver a loguearse
localStorage.clear()

# Verificar que el backend acepte el formato:
# Authorization: Bearer <token>
```

### Problema: WebSocket no conecta
```bash
# Verificar URL en .env.local o configuración
NEXT_PUBLIC_API_URL=http://localhost:8080

# Verificar que el backend tenga endpoint:
# ws://localhost:8080/ws
```

### Problema: Estilos no se aplican
```bash
# Reiniciar servidor de desarrollo
npm run dev

# Verificar que Tailwind esté configurado
# Archivos: tailwind.config.ts, postcss.config.mjs
```

## 📊 Checklist de Funcionalidades

### Autenticación ✅
- [ ] Registro exitoso
- [ ] Login exitoso
- [ ] Logout exitoso
- [ ] Redirección a /jugar después de auth
- [ ] Token guardado en localStorage
- [ ] Middleware protege rutas privadas

### UI/UX ✅
- [ ] Loading spinner se muestra
- [ ] Mensaje de bienvenida personalizado
- [ ] Botones con emojis y hover effects
- [ ] Formularios con validación
- [ ] Errores se muestran correctamente
- [ ] Responsive en mobile/tablet/desktop

### Gestión de Partidas 🔄
- [ ] Crear partida funciona
- [ ] Código de partida se genera
- [ ] Unirse a partida funciona
- [ ] Redirige a /partida/[codigo]

### Gameplay 🔄
- [ ] WebSocket conecta
- [ ] Cartas se muestran
- [ ] Se puede seleccionar carta
- [ ] Transformaciones funcionan
- [ ] Eventos se reciben en tiempo real
- [ ] Lista de jugadores actualiza

## 🎨 Vista Previa de URLs

| Ruta | Descripción | Requiere Auth |
|------|-------------|---------------|
| `/` | Página principal con Hero | No |
| `/login` | Formulario de login | No |
| `/register` | Formulario de registro | No |
| `/jugar` | Crear/Unirse a partida | ✅ Sí |
| `/partida/[codigo]` | Vista del juego | ✅ Sí |

## 🔧 Variables de Entorno Requeridas

Crear archivo `.env.local` en la raíz:

```env
# URL del backend (sin slash al final)
NEXT_PUBLIC_API_URL=http://localhost:8080

# Opcional: Habilitar logs de desarrollo
NEXT_PUBLIC_DEBUG=true
```

## 📞 Endpoints del Backend Utilizados

### Autenticación
- `POST /api/auth/register` - Registro
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Usuario actual

### Partidas
- `POST /api/partidas` - Crear partida
- `POST /api/partidas/unirse` - Unirse con código
- `GET /api/partidas/{codigo}` - Detalle de partida

### Gameplay
- `POST /api/gameplay/{codigo}/select` - Seleccionar carta
- `POST /api/gameplay/{codigo}/transform` - Usar transformación
- `GET /api/cartas/{id}` - Detalle de carta

### WebSocket
- `ws://localhost:8080/ws` - Conexión WebSocket
- `/topic/partida/{codigo}` - Suscripción a eventos

## 🎯 Próxima Sesión de Pruebas

1. ✅ **Verificar autenticación completa** (registro, login, logout)
2. 🔄 **Probar crear partida** y verificar código
3. 🔄 **Probar unirse a partida** con código válido
4. 🔄 **Verificar WebSocket** conecta correctamente
5. 🔄 **Jugar partida completa** seleccionando cartas
6. 🔄 **Probar transformaciones** si backend las soporta

---

**💡 Tip**: Mantén la consola de DevTools abierta para ver logs de errores/conexiones en tiempo real.

**🐉 Dragon Ball**: ¡Que la fuerza de los Saiyajin esté contigo! 🔥
