# Configuración de CORS

## ✅ Estado Actual

La configuración de CORS está completamente habilitada para permitir peticiones desde Next.js (frontend).

## 🔧 Archivos Configurados

### 1. CorsConfig.java

```java
@Configuration
@EnableWebMvc
public class CorsConfig implements WebMvcConfigurer {
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")  // Todas las rutas
                .allowedOrigins(
                    "http://localhost:3000",      // Next.js dev
                    "http://localhost:3001",      // Puerto alternativo
                    "http://127.0.0.1:3000",      // Variante localhost
                    "http://127.0.0.1:3001"
                )
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH")
                .allowedHeaders("*")
                .exposedHeaders("Authorization", "Content-Type")
                .allowCredentials(true)
                .maxAge(3600);
    }
}
```

**Características:**
- ✅ Permite **todas las rutas** (`/**`)
- ✅ Métodos HTTP: GET, POST, PUT, DELETE, OPTIONS, PATCH
- ✅ Todos los headers permitidos
- ✅ Credenciales habilitadas (necesario para cookies/auth)
- ✅ Cache de preflight: 1 hora
- ✅ Headers expuestos: Authorization, Content-Type

### 2. SecurityConfig.java

```java
@Bean
public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
    http
        .csrf(AbstractHttpConfigurer::disable)
        .cors(cors -> cors.configure(http))  // ✅ CORS habilitado
        .authorizeHttpRequests(auth -> auth
            .requestMatchers("/auth/**", "/ws/**", "/swagger-ui/**", "/v3/api-docs/**").permitAll()
            .anyRequest().authenticated()
        )
        // ...
}
```

**Características:**
- ✅ CORS integrado con Spring Security
- ✅ CSRF deshabilitado (necesario para APIs REST)
- ✅ Endpoints públicos: `/auth/**`, `/ws/**`

### 3. WebSocketConfig.java

```java
@Override
public void registerStompEndpoints(StompEndpointRegistry registry) {
    registry.addEndpoint("/ws")
            .setAllowedOriginPatterns(
                "http://localhost:3000",
                "http://localhost:3001",
                "http://127.0.0.1:3000",
                "http://127.0.0.1:3001"
            )
            .withSockJS();
}
```

**Características:**
- ✅ WebSocket CORS configurado
- ✅ SockJS habilitado para compatibilidad

## 🌐 Orígenes Permitidos

| Origen | Propósito |
|--------|-----------|
| `http://localhost:3000` | Next.js desarrollo (puerto por defecto) |
| `http://localhost:3001` | Puerto alternativo |
| `http://127.0.0.1:3000` | Variante localhost |
| `http://127.0.0.1:3001` | Variante alternativa |

## 📝 Endpoints y Permisos

### Endpoints Públicos (sin autenticación)
- `POST /auth/register` - Registro de usuarios
- `POST /auth/login` - Inicio de sesión
- `GET /swagger-ui/**` - Documentación API
- `GET /v3/api-docs/**` - OpenAPI docs
- `WS /ws/**` - WebSocket (requiere token en headers)

### Endpoints Protegidos (requieren JWT)
- `POST /api/partidas/crear`
- `POST /api/partidas/{codigo}/unirse`
- `GET /api/partidas/actual`
- `POST /api/partidas/{id}/salir`
- Todos los demás endpoints bajo `/api/**`

## 🧪 Pruebas

### Desde Next.js (Frontend)

```typescript
// lib/axios.ts
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8080',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,  // ✅ Importante para CORS con credenciales
});
```

### Prueba Manual con cURL

```bash
# Test CORS preflight
curl -X OPTIONS http://localhost:8080/auth/register \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -v

# Deberías ver en la respuesta:
# Access-Control-Allow-Origin: http://localhost:3000
# Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS,PATCH
# Access-Control-Allow-Credentials: true
```

### Prueba de Registro

```bash
curl -X POST http://localhost:8080/auth/register \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "password123"
  }' \
  -v
```

## 🔍 Troubleshooting

### Error: "CORS policy: No 'Access-Control-Allow-Origin' header"

**Solución:**
1. Verifica que el backend esté corriendo en `http://localhost:8080`
2. Asegúrate de que el frontend use exactamente `http://localhost:3000` (no `http://127.0.0.1:3000`)
3. Reinicia el backend después de cambios en la configuración

### Error: "Credentials mode is 'include'"

**Solución:**
Asegúrate de que en tu configuración de Axios tengas:
```typescript
const api = axios.create({
  baseURL: 'http://localhost:8080',
  withCredentials: true,  // ✅ Necesario
});
```

### WebSocket no conecta

**Solución:**
1. Verifica que uses `SockJS` en el frontend
2. El endpoint debe ser: `http://localhost:8080/ws` (no `ws://`)
3. Incluye el token JWT en los headers de conexión

## 🚀 Producción

Para producción, agrega tu dominio a la configuración:

```java
@Override
public void addCorsMappings(CorsRegistry registry) {
    registry.addMapping("/**")
            .allowedOrigins(
                "http://localhost:3000",
                "https://tu-dominio.com",        // ✅ Producción
                "https://www.tu-dominio.com"     // ✅ Con www
            )
            .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH")
            .allowedHeaders("*")
            .exposedHeaders("Authorization", "Content-Type")
            .allowCredentials(true)
            .maxAge(3600);
}
```

O usa variables de entorno:

```java
@Value("${cors.allowed-origins}")
private String[] allowedOrigins;

@Override
public void addCorsMappings(CorsRegistry registry) {
    registry.addMapping("/**")
            .allowedOrigins(allowedOrigins)
            // ...
}
```

En `application.properties`:
```properties
cors.allowed-origins=http://localhost:3000,https://tu-dominio.com
```

## ✅ Checklist de Configuración

- [x] CORS global habilitado en `CorsConfig.java`
- [x] CORS integrado con Spring Security
- [x] WebSocket CORS configurado
- [x] Endpoints públicos definidos (`/auth/**`, `/ws/**`)
- [x] `withCredentials: true` en Axios
- [x] Métodos HTTP necesarios permitidos
- [x] Headers expuestos correctamente

## 📚 Referencias

- [Spring CORS Documentation](https://docs.spring.io/spring-framework/docs/current/reference/html/web.html#mvc-cors)
- [Spring Security CORS](https://docs.spring.io/spring-security/reference/servlet/integrations/cors.html)
- [WebSocket CORS](https://docs.spring.io/spring-framework/docs/current/reference/html/web.html#websocket-server-allowed-origins)
