# Manejo de turnos en el frontend — Guía práctica (para Copilot / equipo frontend)

Objetivo
- Explicar exactamente cómo debe comportarse el frontend respecto a los turnos en tiempo real.
- Listar eventos STOMP/WebSocket que afectan turnos y cuándo reaccionar.
- Proveer handlers/ejemplos en JS/React y soluciones a problemas frecuentes (ej. `PARTIDA_STATE` vs `ATRIBUTO_SELECCIONADO`, 404 /api/cartas).

Resumen rápido
- El backend publica eventos en `/topic/partida/{codigo}` y `/topic/partida/{codigo}/counts`.
- Eventos que afectan turnos / habilitación de UI:
  - `PARTIDA_STATE` / `PARTIDA_ESTADO` (estado completo)
  - `TURNO_CAMBIADO` (indica quién debe jugar a continuación)
  - `ATRIBUTO_SELECCIONADO` (el jugador con turno eligió atributo; habilita el primer drop)
  - `CARTA_JUGADA` (muestra jugada en la mesa; puede cambiar el jugador esperado)
  - `RONDA_RESUELTA` (final de ronda, limpia mesa, asigna nuevo `turnoActual`)
  - `CardCountEvent` (actualiza contadores — útil para UI)

Regla fundamental
- El frontend debe usar `PARTIDA_STATE` / `PartidaDetailResponse` como fuente de verdad cuando sea posible, y usar eventos individuales (`TURNO_CAMBIADO`, `ATRIBUTO_SELECCIONADO`, `CARTA_JUGADA`) como actualizaciones incrementales en tiempo real.

1) Suscripciones recomendadas
- `/topic/partida/{codigo}` — para recibir `PARTIDA_STATE`, `ATRIBUTO_SELECCIONADO`, `CARTA_JUGADA`, `RONDA_RESUELTA`, `TURNO_CAMBIADO`.
- `/topic/partida/{codigo}/counts` — para `CardCountEvent` (actualizaciones rápidas de número de cartas por jugador).
- `/user/queue/partida/{codigo}/errors` — para errores dirigidos al usuario.

2) Concepto: jugadores activos y expectedPlayer
- "Jugadores activos" = jugadores con `numeroCartas > 0`.
- `expectedPlayer` = jugador que, según orden y `turnoActual`, debe jugar la siguiente carta en la ronda actual.
- El backend calcula `expectedPlayer` y publica `TurnoCambiadoEvent` (o `TURNO_CAMBIADO`), y también publica `PartidaResponse`/`PartidaEstadoEvent` con el estado actual.

3) Lógica de habilitación del cliente (pseudocódigo)
- Variables clave que el frontend debe mantener:
  - `partidaState` (PartidaResponse / PartidaDetailResponse si está disponible)
  - `atributoSeleccionado` (string)
  - `cartasEnMesa` (array)
  - `expectedPlayerId` (calculado a partir de `turnoActual` y `cartasEnMesa.length` o tomado de `TurnoCambiadoEvent`)

- Reglas para habilitar drag->drop de la carta:
  - Es tu turno interactivo cuando `myPlayerId === expectedPlayerId`.
  - Si `cartasEnMesa.length === 0`, además debes haber recibido `ATRIBUTO_SELECCIONADO` (o `partidaState.atributoSeleccionado != null`).
  - Si `cartasEnMesa.length > 0`, permitir dropear si `myPlayerId === expectedPlayerId`.

4) Handlers de eventos (ejemplo React + STOMP)
- Conectar y suscribirse (ver `docs/FRONTEND_RONDA_CLEANUP_IMPLEMENTATION.md` para detalle de conexión).

- Manejador central `onPartidaEvent(body)`:
  - if `body.tipo === 'PARTIDA_STATE'` -> `setPartidaState(body)` y recalcular `expectedPlayerId`.
  - if `body.tipo === 'PARTIDA_ESTADO'` -> `setPartidaState(body.estado)` (detalle con atributo y mi mano).
  - if `body.tipo === 'TURNO_CAMBIADO'` -> actualizar `expectedPlayerId = body.jugadorId` y UI.
  - if `body.tipo === 'ATRIBUTO_SELECCIONADO'` -> `setAtributoSeleccionado(body.atributo)` y mostrar badge.
  - if `body.tipo === 'CARTA_JUGADA'` -> `mesa.push({ jugadorId, cartaCodigo, ... })` y recalcula `expectedPlayerId`.
  - if `body.tipo === 'RONDA_RESUELTA'` -> mostrar resultado, limpiar `mesa`, set `atributoSeleccionado` a null, set `turnoActual` al ganador (si lo hay), y actualizar contadores.

Ejemplo corto de `onPartidaEvent`:
```javascript
function onPartidaEvent(body) {
  switch (body.tipo) {
    case 'PARTIDA_STATE':
      setPartidaState(body);
      setAtributoSeleccionado(null); // partidaState puede sobreescribir si contiene el atributo
      break;
    case 'PARTIDA_ESTADO':
      setPartidaState(body.estado);
      setAtributoSeleccionado(body.estado.atributoSeleccionado || null);
      break;
    case 'TURNO_CAMBIADO':
      setExpectedPlayerId(body.jugadorId);
      break;
    case 'ATRIBUTO_SELECCIONADO':
      setAtributoSeleccionado(body.atributo);
      // opcional: setExpectedPlayerId si backend lo incluye
      break;
    case 'CARTA_JUGADA':
      setMesa(prev => [...prev, { jugadorId: body.jugadorId, codigoCarta: body.codigoCarta }]);
      break;
    case 'RONDA_RESUELTA':
      handleRondaResuelta(body);
      break;
  }
}
```

5) Cómo calcular `expectedPlayerId` si no llega `TURNO_CAMBIADO`
- `expectedPlayerId` se calcula en el frontend así:
  - Ordena jugadores por `orden` y filtra `numeroCartas > 0`.
  - Encuentra índice de `turnoActual` dentro de la lista ordenada.
  - `alreadyPlayed = cartasEnMesa.length`.
  - `expectedIndex = (startIndex + alreadyPlayed) % jugadoresActivos.length`.
  - `expectedPlayerId = ordered[expectedIndex].id`.
- Nota: esto replica la lógica del backend; si hay desincronía, pide `SOLICITAR_ESTADO`.

6) Reconexión y `PARTIDA_STATE` vs eventos incrementales
- Al reconectar: pide `PartidaDetailResponse` vía `/app/partida/{codigo}/accion` con `accion: 'SOLICITAR_ESTADO'` o realiza GET REST `GET /api/partida/{codigo}`.
- Usa `PartidaDetailResponse` para regenerar `mesa`, `atributoSeleccionado`, `turnoActual` y `miJugador.cartasEnMano`.

7) Problema en tus logs: ¿por qué "los turnos no funcionan"?
Basado en los snippets que enviaste: hay varias pistas y soluciones.

- Observación 1: recibes `PARTIDA_STATE` con jugadores y mano (ej. jugadorId Thomas y su `cartasEnMano`). Esto es bueno: `PARTIDA_STATE` es la fuente de verdad.
  - Acción: cuando recibes `PARTIDA_STATE`, recalcula `expectedPlayerId` usando el algoritmo del punto 5 y actualiza UI.

- Observación 2: recibes múltiples eventos `ATRIBUTO_SELECCIONADO` y `CARTA_JUGADA`. Eso indica que el backend publica correctamente. Pero el problema es que el frontend puede no estar recalculando `expectedPlayerId` o sigue usando un valor obsoleto.
  - Acción: asegúrate de que `handleCartaJugado` y `handleAtributoSeleccionado` actualicen `cartasEnMesa` y `atributoSeleccionado` y luego recalculen `expectedPlayerId`.

- Observación 3 (errores en logs): `GET http://localhost:3000/api/cartas 404 (Not Found)` aparece repetidamente. Esto no rompe los turnos directamente, pero puede saturar tu render/efectos y generar problemas de sincronización (por ejemplo, efectos que se disparan en bucle y reinicializan estado). El frontend parece estar intentando cargar cartas desde el mismo host que sirve el frontend (puerto 3000) en vez del backend (p.ej. 8080). Corregir esto evita ruido y efectos secundarios.
  - Acción inmediata: arreglar la URL en `useGameData.ts` para apuntar al backend o usar proxy. Ejemplo:
    - En desarrollo Next.js, usar `NEXT_PUBLIC_API_URL=http://localhost:8080` y en el fetch: `${process.env.NEXT_PUBLIC_API_URL}/api/cartas`.

8) Recomendaciones concretas para arreglar los turnos (checklist)
- [ ] En el handler central de STOMP (`onPartidaEvent`) actualiza siempre `partidaState` y recalcula `expectedPlayerId`.
- [ ] En `handleCartaJugado` añade la carta a `cartasEnMesa` y recalcula `expectedPlayerId`.
- [ ] En `handleAtributoSeleccionado` setea `atributoSeleccionado` y, si `cartasEnMesa.length === 0`, habilita el drop para `expectedPlayerId`.
- [ ] Evita que efectos de React reinicien conexiones/estado en bucle (revisa el double-invoke en React dev mode y 404 que provoca reintentos). Usa deps en `useEffect` correctamente.
- [ ] En reconexión, envía `SOLICITAR_ESTADO` y reemplaza el estado local con el `PartidaDetailResponse` recibido.
- [ ] Corrige el endpoint de `GET /api/cartas` en `useGameData.ts` (apunta a backend en 8080 o usa env var) para evitar bucles de error.

9) Snippets prácticos de recalculo `expectedPlayerId`
```javascript
function calcularExpectedPlayerId(partida) {
  const jugadoresActivos = partida.jugadores
    .filter(j => j.numeroCartas > 0)
    .sort((a,b) => a.orden - b.orden);
  if (jugadoresActivos.length === 0) return null;
  const startIndex = jugadoresActivos.findIndex(j => j.id === partida.turnoActual);
  if (startIndex === -1) return jugadoresActivos[0].id; // fallback
  const alreadyPlayed = mesa.length; // o partida.cartasEnMesa.length si lo recibes
  const expectedIndex = (startIndex + alreadyPlayed) % jugadoresActivos.length;
  return jugadoresActivos[expectedIndex].id;
}
```

10) Manejo de doble recepción de eventos (mensaje duplicado en logs)
- Es normal que STOMP/SockJS entregue múltiples suscripciones en desarrollo si tienes varias suscripciones activas o reconexiones. Evita re-suscribirte sin desuscribir; guarda `clientRef` y solo suscribe cuando `onConnect` ocurra una vez.

11) Ejemplo de flujo completo (timeline)
- Jugador A tiene `turnoActual` = A. A envía `SELECCIONAR_ATRIBUTO` -> backend publica `ATRIBUTO_SELECCIONADO`.
- Frontend recibe `ATRIBUTO_SELECCIONADO` -> muestra badge del atributo y permite a A dropear su carta.
- A hace drop -> frontend envía `drag` con `target='mesa'` -> backend procesa `jugarCarta` y publica `CARTA_JUGADA` y `TURNO_CAMBIADO` (si la ronda aún no completa).
- Frontend recibe `CARTA_JUGADA` y `TURNO_CAMBIADO` -> añade carta a `mesa` y habilita al siguiente jugador (si es localmente `myPlayerId`) para dropear.
- Cuando `cartasEnMesa.size === jugadoresActivos`, backend llama `resolverRonda` y publica `RONDA_RESUELTA` + `CardCountEvent`.
- Frontend recibe `RONDA_RESUELTA` -> anima, limpia `mesa`, actualiza `atributoSeleccionado = null`, actualiza `turnoActual` al ganador.

12) Soluciones rápidas ahora mismo (prioritarias)
- Arreglar `GET /api/cartas 404` para evitar reintentos y efectos inesperados:
  - Ajusta la URL base en `useGameData.ts` a la del backend (p.ej. 8080) o usar `NEXT_PUBLIC_API_URL`.
- Revisar `useEffect` que conecta STOMP y asegurar que:
  - no crea múltiples suscripciones en cada render,
  - se limpia `client.deactivate()` en cleanup.
- Añadir logs para `expectedPlayerId` cada vez que recibes `CARTA_JUGADA` o `PARTIDA_STATE` para detectar por qué la UI no habilita al jugador correcto.

---

Si quieres, hago ahora:
- A) Editar `useGameData.ts` para apuntar a `process.env.NEXT_PUBLIC_API_URL` y evitar el 404.
- B) Añadir logs y corregir el cálculo de `expectedPlayerId` en el frontend (si me das la ruta del archivo puedo editarlo).
- C) Crear un test E2E que verifique cambio de turno con dos clientes.

Dime cuál prefieres y lo implemento.

# Manejo de turnos en el frontend (Guía práctica)

Este documento explica cómo el frontend debe manejar el turno y la jugabilidad en tiempo real, usando los eventos publicados por el backend, incluyendo el nuevo `TurnoCambiadoEvent` que hemos añadido.

Resumen rápido
- `turnoActual` en `PartidaResponse` representa el jugador que inició la ronda (starter). No cambia hasta que la ronda se resuelve.
- `TurnoCambiadoEvent` (publicado a `/topic/partida/{codigo}`) indica explícitamente quién debe jugar a continuación dentro de la ronda.
- El frontend debe usar `TurnoCambiadoEvent` (o calcular localmente con `turnoActual` + `cartasEnMesa.length`) para habilitar/deshabilitar controles.

Destinos STOMP y REST relevantes
- `/topic/partida/{codigo}` — PartidaResponse, CartaJugadaEvent, RondaResueltaEvent, TurnoCambiadoEvent.
- `/topic/partida/{codigo}/counts` — CardCountEvent (opcional).
- `/topic/partida/{codigo}/drag` — PlayerDragEvent (previews de drag).
- `/user/queue/partida/{codigo}/errors` — ServerErrorEvent (rechazos de acciones dirigidos al jugador).
- Envío: `/app/partida/registrar` (reconectar/registrar sesión) y `/app/partida/{codigo}/drag` (enviar drop/drag).
- REST: `POST /api/partidas/{codigo}/mano/reorder` — persistir el orden de la mano.

Tipos sugeridos (TypeScript)
```ts
type JugadorDto = {
  id: string;
  nombre: string;
  orden: number;
  numeroCartas: number;
  conectado?: boolean;
};

type PartidaResponse = {
  codigo: string;
  turnoActual?: string;
  jugadores: JugadorDto[];
  cartasEnMesa?: Array<{ jugadorId: string; cartaCodigo: string; valor: number }>;
  // otros campos...
};

type TurnoCambiadoEvent = {
  expectedPlayerId: string;
  expectedPlayerNombre?: string;
  alreadyPlayed: number;
};

type ServerErrorEvent = { code: string; message: string; details?: any };
```

Hook recomendado: `useTurnHandler`
```ts
import { useEffect, useState, useCallback } from 'react';
import type { Client } from '@stomp/stompjs';

export function useTurnHandler(stompClient: Client | null, partidaCodigo: string, myJugadorId: string | null) {
  const [expectedPlayer, setExpectedPlayer] = useState<string | null>(null);
  const [expectedNombre, setExpectedNombre] = useState<string | null>(null);
  const [alreadyPlayed, setAlreadyPlayed] = useState<number>(0);

  const handleTurnoChanged = useCallback((msg: any) => {
    const body: TurnoCambiadoEvent = JSON.parse(msg.body);
    setExpectedPlayer(body.expectedPlayerId);
    setExpectedNombre(body.expectedPlayerNombre || null);
    setAlreadyPlayed(body.alreadyPlayed || 0);
  }, []);

  const handlePartida = useCallback((msg: any) => {
    const body: PartidaResponse = JSON.parse(msg.body);
    // Re-sincronizar si es necesario (partida tiene la fuente de verdad)
    // Calcular expected fallback si no recibimos TurnoCambiadoEvent
    if (body && body.jugadores) {
      const activos = body.jugadores.filter(j => (j.numeroCartas ?? 0) > 0).sort((a,b) => (a.orden ?? 0) - (b.orden ?? 0));
      if (body.turnoActual && activos.length > 0) {
        const startIdx = activos.findIndex(j => j.id === body.turnoActual);
        const already = (body.cartasEnMesa || []).length;
        if (startIdx !== -1) {
          const expected = activos[(startIdx + already) % activos.length];
          setExpectedPlayer(expected.id);
        }
      }
    }
  }, []);

  useEffect(() => {
    if (!stompClient || !stompClient.connected) return;
    const s1 = stompClient.subscribe(`/topic/partida/${partidaCodigo}`, handlePartida);
    const s2 = stompClient.subscribe(`/topic/partida/${partidaCodigo}`, handleTurnoChanged);
    const s3 = stompClient.subscribe(`/user/queue/partida/${partidaCodigo}/errors`, (m)=>{
      const e: ServerErrorEvent = JSON.parse(m.body);
      // mostrar toast / modal
      console.warn('Server error', e);
    });
    return () => { try { s1.unsubscribe(); s2.unsubscribe(); s3.unsubscribe(); } catch(e) {} };
  }, [stompClient, partidaCodigo, handlePartida, handleTurnoChanged]);

  const isMyTurn = () => myJugadorId != null && expectedPlayer === myJugadorId;

  return { expectedPlayer, expectedNombre, alreadyPlayed, isMyTurn };
}
```

PlayersPanel: cómo usarlo
- Usa `useTurnHandler` para determinar si es el turno del usuario.
- Muestra badge "Tu turno" cuando `isMyTurn()` sea true.
- Deshabilita drag/drop o botones de acción en caso contrario.

Enviar drop (ejemplo)
```ts
function sendDrop(stompClient: Client, partidaCodigo: string, jugadorId: string, cardCode: string) {
  const event = { jugadorId, cardCode, dragging: false, target: 'mesa' };
  stompClient.publish({ destination: `/app/partida/${partidaCodigo}/drag`, body: JSON.stringify(event) });
}
```

Rechazos y reconciliación
- El servidor puede rechazar una jugada: recibirás `ServerErrorEvent` en `/user/queue/partida/{codigo}/errors`.
- Al recibir un rechazo, haz:
  1) Mostrar mensaje al usuario.
  2) Re-sincronizar estado con `PartidaResponse` (si no lo tienes actualizado).

Checklist de verificación para integradores frontend
- [ ] Enviar `/app/partida/registrar` con `jugadorId` al conectar.
- [ ] Suscribirse a `/topic/partida/{codigo}` y `/user/queue/partida/{codigo}/errors`.
- [ ] Usar `TurnoCambiadoEvent` para habilitar controles de juego.
- [ ] Publicar drop a `/app/partida/{codigo}/drag` y manejar `ServerErrorEvent`.
- [ ] Persistir reorder de mano en `POST /api/partidas/{codigo}/mano/reorder`.

Notas finales
- `TurnoCambiadoEvent` es una ayuda UX: si el cliente se desconecta y reconecta, `PartidaResponse` reconstruirá el estado (fuente de verdad).
- Si quieres que publique en un topic separado (`/topic/partida/{codigo}/turno`) dilo y lo implemento.

---

Documento creado automáticamente por el equipo de backend para guiar al frontend.

## Payloads de eventos (ejemplos JSON)

Aquí tienes ejemplos reales de cómo se serializan los eventos que llegan por STOMP. Los objetos incluyen `tipo` (definido por `BaseGameEvent`) y `timestamp`.

- CartaJugadaEvent (cuando un jugador pone una carta en la mesa):

```json
{
  "tipo": "CARTA_JUGADA",
  "timestamp": "2025-10-17T02:40:00Z",
  "jugadorId": "player-1",
  "nombreJugador": "Alicia",
  "codigoCarta": "C-001",
  "nombreCarta": "Dragón Azul",
  "imagenCarta": "https://cdn.example.com/cards/C-001.png"
}
```

- TurnoCambiadoEvent (indica quién debe jugar a continuación dentro de la ronda):

```json
{
  "tipo": "TURNO_CAMBIADO",
  "timestamp": "2025-10-17T02:40:01Z",
  "expectedPlayerId": "player-2",
  "expectedPlayerNombre": "Bruno",
  "alreadyPlayed": 1
}
```

- RondaResueltaEvent (cuando la ronda termina, incluye ganador o empate y los resultados por jugador):

```json
{
  "tipo": "RONDA_RESUELTA",
  "timestamp": "2025-10-17T02:40:10Z",
  "ganadorId": "player-3",        // null si hubo empate
  "nombreGanador": "Carla",
  "atributoUsado": "fuerza",
  "valorGanador": 95,
  "resultados": [
    { "jugadorId": "player-1", "nombreJugador": "Alicia", "codigoCarta": "C-001", "valor": 80 },
    { "jugadorId": "player-2", "nombreJugador": "Bruno", "codigoCarta": "C-007", "valor": 90 },
    { "jugadorId": "player-3", "nombreJugador": "Carla", "codigoCarta": "C-010", "valor": 95 }
  ],
  "empate": false
}
```

- CardCountEvent (actualización de contadores de cartas por jugador):

```json
{
  "tipo": "CARD_COUNTS",
  "timestamp": "2025-10-17T02:40:11Z",
  "counts": [
    { "jugadorId": "player-1", "nombre": "Alicia", "count": 5, "orden": 1 },
    { "jugadorId": "player-2", "nombre": "Bruno", "count": 4, "orden": 2 },
    { "jugadorId": "player-3", "nombre": "Carla", "count": 8, "orden": 3 }
  ]
}
```

Notas sobre sincronización en tiempo real
- Cambio de turno en tiempo real: el backend publica `TURNO_CAMBIADO` inmediatamente después de una `CARTA_JUGADA` (para indicar el siguiente jugador esperado) y también tras `RONDA_RESUELTA` cuando hay un ganador — por lo tanto el cliente recibe la señal de cambio de turno en tiempo real.
- Actualización del mazo/mano en tiempo real: cuando hay un ganador en `RondaResueltaEvent`, el backend modifica las manos (`Jugador.getCartasEnMano()`) y los contadores (`Jugador.numeroCartas`) en el servidor, persiste la `Partida` y publica `RONDA_RESUELTA` y `CARD_COUNTS`. Los clientes pueden usar `CARD_COUNTS` para actualizar contadores rápidamente, y `PARTIDA_STATE`/`PartidaDetailResponse` para reconstruir la mano completa del usuario (si el payload del state incluye las cartas en mano del jugador).
- Recomendación: al recibir `RONDA_RESUELTA`, actualiza tanto la UI de la mesa (limpiar/animar) como los contadores y, si tu cliente muestra la mano completa del propio jugador, solicita o espera el próximo `PARTIDA_STATE` que contendrá la mano actualizada del ganador.

Con esto el frontend tendrá ejemplos exactos para parsear y reaccionar a los eventos en tiempo real.
