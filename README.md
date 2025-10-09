# 🎮 Card Match Battle - Backend API

## 🚀 Inicio Rápido

### Prerrequisitos
- ☕ **Java 21** instalado
- 🍃 **MongoDB** ejecutándose en `localhost:27017`
- 📦 **Maven** (incluido con Maven Wrapper)

### Iniciar el Servidor

#### Windows (PowerShell/CMD)
```bash
.\mvnw.cmd spring-boot:run
```

#### Linux/Mac
```bash
./mvnw spring-boot:run
```

El servidor iniciará en: **http://localhost:8080**

---

## 📖 Documentación API (Swagger UI)

Una vez que el servidor esté ejecutándose, accede a:

### 🎯 Swagger UI - Interfaz Interactiva
```
http://localhost:8080/swagger-ui.html
```

**Características de Swagger UI:**
- ✅ Ver todos los endpoints disponibles organizados por categorías
- ✅ Probar las peticiones directamente desde el navegador
- ✅ Ver ejemplos de request/response
- ✅ Descargar especificación OpenAPI en JSON/YAML
- ✅ Generar clientes automáticamente para Next.js/React

### 📄 Especificación OpenAPI

**JSON:**
```
http://localhost:8080/v3/api-docs
```

**YAML:**
```
http://localhost:8080/v3/api-docs.yaml
```

---

## 🔌 Endpoints Principales

### Gestión de Partidas
- `POST /api/partidas/crear` - Crear nueva partida
- `POST /api/partidas/{codigo}/unirse` - Unirse a partida
- `GET /api/partidas/{codigo}` - Obtener info de partida
- `GET /api/partidas/{codigo}/detalle?jugadorId={id}` - Detalle completo

### Lógica de Juego
- `POST /api/partidas/{codigo}/iniciar` - Iniciar juego (requiere 7 jugadores)
- `POST /api/partidas/{codigo}/seleccionar-atributo` - Elegir atributo para ronda
- `POST /api/partidas/{codigo}/jugar` - Jugar carta

### Cartas
- `GET /api/cartas` - Listar todas las cartas
- `GET /api/cartas/{codigo}` - Obtener carta específica
- `POST /api/cartas/sincronizar` - Importar desde API externa

---

## 🌐 WebSocket (Tiempo Real)

**Endpoint:** `ws://localhost:8080/ws`  
**Topic:** `/topic/partida/{codigo}`

**Eventos:**
- `CARTA_JUGADA` - Cuando un jugador juega una carta
- `RONDA_RESUELTA` - Al terminar una ronda
- `JUEGO_FINALIZADO` - Cuando el juego termina

---

## 🧪 Testing Rápido con Swagger

1. ✅ Inicia el servidor: `./mvnw.cmd spring-boot:run`
2. ✅ Abre: http://localhost:8080/swagger-ui.html
3. ✅ Navega a **Partidas** → **POST /api/partidas/crear**
4. ✅ Haz clic en "Try it out"
5. ✅ Prueba con este JSON:
```json
{
  "nombreJugador": "Goku"
}
```
6. ✅ Copia el `codigo` de la respuesta
7. ✅ Prueba **POST /api/partidas/{codigo}/unirse** con otro jugador

---

## 🎯 Integración con Next.js

### Configuración

**`.env.local` en tu proyecto Next.js:**
```env
NEXT_PUBLIC_API_URL=http://localhost:8080/api
NEXT_PUBLIC_WS_URL=ws://localhost:8080/ws
```

### Ejemplo de Cliente API

```typescript
// lib/api.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL;

export async function crearPartida(nombreJugador: string) {
  const res = await fetch(`${API_URL}/partidas/crear`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombreJugador }),
  });
  return res.json();
}
```

### Generador de Cliente TypeScript

```bash
# Opción 1: openapi-typescript
npx openapi-typescript http://localhost:8080/v3/api-docs -o types/api.ts

# Opción 2: openapi-generator
npx @openapitools/openapi-generator-cli generate \
  -i http://localhost:8080/v3/api-docs \
  -g typescript-fetch \
  -o ./src/generated/api
```

📖 **Guía completa**: Ver [SWAGGER_API_DOCUMENTATION.md](./SWAGGER_API_DOCUMENTATION.md)

---

## 🧪 Ejecutar Tests

```bash
# Ejecutar todos los tests
./mvnw.cmd test

# Ejecutar con cobertura
./mvnw.cmd clean verify
```

**Resultado esperado:** 26 tests, 0 fallos ✅

---

## 🐳 Docker (Opcional)

```bash
# Construir imagen
docker build -t card-match-battle-api .

# Ejecutar con docker-compose (incluye MongoDB)
docker-compose up
```

---

## 📊 Arquitectura

```
src/
├── main/java/com/juegocartas/juegocartas/
│   ├── controller/          # REST Controllers
│   │   ├── rest/           # Endpoints HTTP
│   │   └── websocket/      # WebSocket STOMP
│   ├── service/            # Lógica de negocio
│   ├── repository/         # Acceso a MongoDB
│   ├── model/              # Entidades (Partida, Carta, Jugador)
│   ├── dto/                # Request/Response DTOs
│   ├── config/             # Configuración (CORS, WebSocket, OpenAPI)
│   └── exception/          # Manejadores de errores
└── test/                   # Tests unitarios
```

---

## 🔒 CORS

Ya configurado para **Next.js** en `http://localhost:3000`

Modificar en: `src/main/java/com/juegocartas/juegocartas/config/CorsConfig.java`

---

## 📚 Documentación Adicional

- 📖 [Análisis de Cumplimiento](./docs/ANALISIS_CUMPLIMIENTO.md)
- 📖 [Mejoras Implementadas](./INFORME_MEJORAS_IMPLEMENTADAS.md)
- 📖 [Guía API para Next.js](./SWAGGER_API_DOCUMENTATION.md)
- 📖 [API de Dragon Ball](https://dragonball-api.com/documentation)

---

## 🐛 Troubleshooting

### MongoDB no se conecta
```bash
# Verificar si MongoDB está ejecutándose
mongosh --eval "db.version()"

# Si no está instalado, descarga desde:
# https://www.mongodb.com/try/download/community
```

### Puerto 8080 ya en uso
```bash
# Cambiar puerto en application.properties
server.port=8081
```

### Error de compilación
```bash
# Limpiar y recompilar
./mvnw.cmd clean install -DskipTests
```

---

## 🤝 Contribuciones

1. Fork el proyecto
2. Crea una rama: `git checkout -b feature/nueva-funcionalidad`
3. Commit: `git commit -m 'Agregar nueva funcionalidad'`
4. Push: `git push origin feature/nueva-funcionalidad`
5. Abre un Pull Request

---

## 📄 Licencia

MIT License - Ver [LICENSE](./LICENSE) para más detalles

---

## 🎉 Estado del Proyecto

✅ **26/26 tests pasando**  
✅ **API completamente documentada con Swagger**  
✅ **Thread-safe para concurrencia**  
✅ **Listo para producción**

---

**¡Desarrollado con ❤️ para fans de Dragon Ball!** 🐉⚡

**Repository:** https://github.com/SLarkZ01/Juego-De-Cartas-Backend
