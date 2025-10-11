# Reconexión Frontend - Guía Rápida

Esta guía muestra los pasos concretos que el frontend debe seguir para reconectar correctamente a una partida y asegurar que todos los jugadores (incluido el creador) vean en tiempo real los cambios de la lista de jugadores.

Flujo recomendado (por partida):

1. (Opcional) Reconectar vía REST
   - POST /api/partidas/{codigo}/reconectar
   - Body: `{ "jugadorId": "<jugadorId_guardado>" }` (opcional si el token JWT identifica al usuario)
   - Objetivo: marcar al jugador como conectado en el servidor antes de abrir la conexión WS.

2. Abrir conexión WebSocket STOMP
   - Conectar a `NEXT_PUBLIC_WS_URL` (ej. `http://localhost:8080/ws`) usando SockJS + @stomp/stompjs.
   - Incluir header Authorization: `Bearer <token>` en `connectHeaders`.

3. En onConnect publicar registro STOMP
   - Destination: `/app/partida/registrar`
   - Body: `{ "jugadorId": "<jugadorId>", "partidaCodigo": "<codigo>" }`
   - Objetivo: asociar la sessionId WS con el jugador (server maps session->jugador y cancela timers de desconexión si aplica).

4. Suscribirse al topic de la partida
   - Topic: `/topic/partida/{codigo}`
   - Después de suscribirse, el servidor publicará inmediatamente un `PartidaResponse` con la lista completa de jugadores (incluyendo `conectado=true` si la reconexión fue exitosa).

Notas de implementación
- Guarda `jugadorId` en localStorage con la clave `jugadorId_{codigo}` cuando crees o te unas a una partida.
- Al montar el componente del lobby, intenta leer `localStorage.getItem(`jugadorId_${codigo}`)` y usa ese ID para llamar al endpoint `reconectar` y/o para publicarlo en STOMP.
- El backend aplica un grace period de 5 segundos al marcar desconexiones: si reconectas en 5s, no verás el flicker de "Desconectado".

Checklist para pruebas manuales
- [ ] Crear partida en ventana A; confirmar `jugadorId_{codigo}` en localStorage.
- [ ] Ir a lobby en A (suscribirse al topic). En DevTools WS: comprobar publish a `/app/partida/registrar` y la suscripción a `/topic/partida/{codigo}`.
- [ ] En ventana B, unirse a la misma partida; comprobar que tanto B como A muestran el evento `JUGADOR_UNIDO` y la lista actualizada.
- [ ] Recargar A y verificar que no aparece como desconectado si reconecta en <5s.

Debug tips
- Network → WS frames: verificar `SUBSCRIBE`, `SEND` frames y el body del `MESSAGE` que contiene `PartidaResponse`.
- Consola: buscar logs con prefijo `📤 Registrando jugadorId` y `📡 Suscrito a`.

