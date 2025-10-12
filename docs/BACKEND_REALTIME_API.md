# Backend Real-time Features - Documentación Técnica

## 📋 Resumen

Este documento describe la implementación de funcionalidades en tiempo real para el juego de cartas Dragon Ball:

- **Card Counts**: Visualización del número de cartas de cada jugador sin revelar las cartas específicas
- **Drag Preview**: Preview en tiempo real del arrastre de cartas entre jugadores

## 🏗️ Arquitectura

### Principios SOLID Aplicados

1. **Single Responsibility Principle (SRP)**
   - `DragValidationService`: Solo valida eventos de drag
   - `GameServiceImpl`: Solo gestiona lógica del juego
   - `PartidaWebSocketController`: Solo maneja mensajes WebSocket

2. **Open/Closed Principle (OCP)**
   - Eventos extensibles mediante `BaseGameEvent`
   - Validaciones pluggables mediante interfaz `DragValidationService`

3. **Dependency Inversion Principle (DIP)**
   - Controladores dependen de abstracciones (`EventPublisher`, `DragValidationService`)
   - Servicios inyectados via constructor

4. **Interface Segregation Principle (ISP)**
   - Interfaces específicas por funcionalidad (`DragValidationService`)

### Componentes Implementados

```
┌─────────────────────────────────────┐
│  PartidaWebSocketController         │
│  - @MessageMapping handlers         │
│  - Routing de mensajes              │
└────────────┬────────────────────────┘
             │
             ├──► DragValidationService
             │    └─ Validación
             │    └─ Anti-cheat
             │    └─ Throttling (50ms)
             │
             ├──► EventPublisher
             │    └─ Broadcast a topics
             │
             └──► GameServiceImpl
                  └─ publishCardCounts()
```

## 📡 Endpoints WebSocket

### Conexión

```
URL: ws://localhost:8080/ws
Protocolo: STOMP sobre SockJS
```

### Topics de Suscripción

| Topic | Descripción | Frecuencia |
|-------|-------------|-----------|
| `/topic/partida/{codigo}/counts` | Eventos de conteo de cartas | Al cambiar # cartas |
| `/topic/partida/{codigo}/drag` | Eventos de drag preview | Hasta 20/s por jugador |
| `/topic/partida/{codigo}` | Eventos generales (iniciar, jugar, etc) | Variable |

### Mensajes de Entrada

#### 1. Registrar Jugador

**Destino:** `/app/partida/registrar`

**Payload:**
```json
{
  "jugadorId": "uuid-123",
  "partidaCodigo": "ABC123"
}
```

**Efecto:**
- Asocia la sesión WebSocket con el jugador
- Marca al jugador como conectado
- Cancela timeouts de desconexión pendientes

#### 2. Enviar Drag Event

**Destino:** `/app/partida/{codigo}/drag`

**Payload:**
```json
{
  "jugadorId": "uuid-123",
  "jugadorNombre": "Jugador 1",
  "dragging": true,
  "cardIndex": 0,
  "normalizedX": 0.45,
  "normalizedY": 0.75,
  "target": "mesa"
}
```

**Validaciones aplicadas:**
1. ✅ Jugador autenticado coincide con jugadorId del payload
2. ✅ Jugador pertenece a la partida
3. ✅ Jugador está conectado
4. ✅ cardIndex válido (si se incluye)
5. ✅ Coordenadas normalizadas entre 0.0 y 1.0
6. ✅ Throttling: máximo 1 evento cada 50ms

**Si pasa validación:**
- Se retransmite a `/topic/partida/{codigo}/drag`
- Todos los suscriptores reciben el evento

## 📤 Eventos de Salida

### CARD_COUNTS

**Topic:** `/topic/partida/{codigo}/counts`

**Cuándo se emite:**
- Después de `iniciarPartida()` (repartir cartas)
- Después de `jugarCarta()` (jugador reduce su mano)
- Después de `resolverRonda()` (redistribución de cartas)

**Payload:**
```json
{
  "tipo": "CARD_COUNTS",
  "timestamp": "2025-10-12T09:15:30.123Z",
  "counts": [
    {
      "jugadorId": "uuid-1",
      "nombre": "Jugador 1",
      "count": 5,
      "orden": 1
    },
    {
      "jugadorId": "uuid-2",
      "nombre": "Jugador 2",
      "count": 7,
      "orden": 2
    }
  ]
}
```

### PLAYER_DRAG

**Topic:** `/topic/partida/{codigo}/drag`

**Cuándo se emite:**
- Cuando un cliente envía un evento de drag válido
- Retransmitido por el servidor (broadcast)

**Payload:**
```json
{
  "tipo": "PLAYER_DRAG",
  "timestamp": "2025-10-12T09:15:30.456Z",
  "jugadorId": "uuid-1",
  "jugadorNombre": "Jugador 1",
  "dragging": true,
  "cardIndex": 0,
  "normalizedX": 0.45,
  "normalizedY": 0.75,
  "target": "mesa"
}
```

**Campos opcionales:**
- `cardIndex`: Índice en la mano (solo UX, no revela carta)
- `normalizedX/Y`: Posición 0.0-1.0 (independiente de resolución)
- `target`: "mesa", "mano", null

## 🔒 Seguridad y Anti-Cheat

### Validaciones Implementadas

1. **Autenticación de Sesión**
   ```java
   String jugadorId = wsListener.getJugadorId(sessionId);
   if (!jugadorId.equals(event.getJugadorId())) {
       // Rechazar: spoofing attempt
   }
   ```

2. **Pertenencia a Partida**
   ```java
   Optional<Jugador> jugador = partida.getJugadores().stream()
       .filter(j -> j.getId().equals(jugadorId))
       .findFirst();
   ```

3. **Validación de Card Index**
   ```java
   if (cardIndex < 0 || cardIndex >= jugador.getCartasEnMano().size()) {
       // Rechazar: índice inválido
   }
   ```

4. **Throttling (Rate Limiting)**
   ```java
   // Máximo 1 evento cada 50ms (20 eventos/segundo)
   private static final long MIN_INTERVAL_MS = 50;
   ```

### Privacidad de Datos

**✅ Lo que SE envía:**
- Número de cartas de cada jugador
- Índice de posición en la mano (opcional)
- Posición visual normalizada
- ID y nombre del jugador

**❌ Lo que NO se envía:**
- Código/identificador de la carta específica
- Atributos de la carta
- Contenido de la mano completa de otros jugadores

## 📊 Rendimiento

### Optimizaciones Aplicadas

1. **Throttling en Servidor**
   - Máximo 20 eventos/s por jugador
   - Implementado con `ConcurrentHashMap<String, Long>`
   - Thread-safe

2. **Validación Rápida**
   - Early return en validaciones
   - Caché de estados en memoria

3. **Broadcast Eficiente**
   - Usa `EventPublisher` con STOMP broker
   - Sin serialización redundante

4. **Memory Management**
   - `lastEventTime` map se limpia implícitamente por GC
   - Sin locks globales (usa ConcurrentHashMap)

### Métricas Esperadas

| Métrica | Valor |
|---------|-------|
| Latencia promedio | < 100ms |
| Throughput | 20 msg/s/jugador |
| Max jugadores concurrentes | 7 por partida |
| Max partidas concurrentes | Limitado por memoria/CPU |

## 🧪 Testing

### Test de Validación

```java
@Test
public void validateDragEvent_shouldRejectInvalidCardIndex() {
    PlayerDragEvent event = new PlayerDragEvent();
    event.setJugadorId("j1");
    event.setCardIndex(99); // Índice inválido
    
    boolean result = dragValidationService.validateDragEvent("ABC", "j1", event);
    
    assertFalse(result);
}
```

### Test de Throttling

```java
@Test
public void shouldThrottle_shouldReturnTrueIfTooFast() {
    dragValidationService.recordEvent("j1");
    
    // Intentar inmediatamente (< 50ms)
    boolean throttled = dragValidationService.shouldThrottle("j1");
    
    assertTrue(throttled);
}
```

### Test Manual con Postman/STOMP Client

1. Conectar a `ws://localhost:8080/ws`
2. Enviar CONNECT frame
3. Registrar jugador: `SEND /app/partida/registrar`
4. Suscribirse a topics
5. Enviar drag event: `SEND /app/partida/{codigo}/drag`
6. Verificar broadcast en topic

## 📚 Referencias

- [STOMP Protocol](https://stomp.github.io/)
- [Spring WebSocket Documentation](https://docs.spring.io/spring-framework/reference/web/websocket.html)
- [SockJS Client](https://github.com/sockjs/sockjs-client)

## 🔄 Flujo Completo de Ejemplo

```
1. Cliente conecta WebSocket
   └─► CONNECT a ws://localhost:8080/ws

2. Cliente se registra
   └─► SEND /app/partida/registrar
       └─► Backend asocia sessionId → jugadorId
       └─► Backend publica estado actual

3. Cliente se suscribe
   ├─► SUBSCRIBE /topic/partida/ABC/counts
   └─► SUBSCRIBE /topic/partida/ABC/drag

4. Backend inicia partida
   └─► GameService.iniciarPartida()
       └─► deckService.repartir()
       └─► publishCardCounts()
           └─► BROADCAST CardCountEvent a /topic/.../counts

5. Cliente A arrastra carta
   └─► SEND /app/partida/ABC/drag
       └─► Backend valida
       └─► Backend aplica throttling
       └─► BROADCAST PlayerDragEvent a /topic/.../drag
           └─► Cliente B recibe y muestra preview

6. Cliente A juega carta
   └─► POST /api/partidas/ABC/jugar
       └─► GameService.jugarCarta()
           └─► publishCardCounts() (nuevo conteo)
               └─► BROADCAST CardCountEvent
```

## 🚀 Siguientes Pasos

Para integrar con el frontend:
1. Consultar `docs/REALTIME_INTEGRATION_NEXTJS.md`
2. Usar hook `useGameWebSocket` provisto
3. Implementar componentes `<PlayerCardCount>` y `<DragPreview>`
4. Testear throttling y latencia en red lenta

---

**Autor:** Backend Team  
**Última actualización:** 2025-10-12  
**Versión:** 1.0.0
