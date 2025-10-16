## Sincronización del panel de jugadores (front-end)

Propósito
-------
Actualizar en tiempo real la lista de jugadores (esquina superior izquierda): nombre, avatar, número de cartas, orden en la mesa, estado de conexión y quién tiene el turno. El backend publica eventos STOMP y ahora envía además una `PartidaResponse` completa que debe usarse como fuente de verdad.

Resumen de destinos STOMP y REST relevantes
-----------------------------------------
- Suscripciones (frontend -> recibir):
  - `/topic/partida/{codigo}` — PartidaResponse y eventos relacionados (CartaJugadaEvent, RondaResueltaEvent). Usar ésto como la fuente de verdad para el panel.
  - `/topic/partida/{codigo}/counts` — CardCountEvent (actualizaciones rápidas de conteos). Opcional si ya consumes PartidaResponse.
  - `/topic/partida/{codigo}/drag` — eventos de arrastre para animaciones/preview (PlayerDragEvent).
- Mensajes dirigidos al usuario (frontend -> recibir):
  - `/user/queue/partida/{codigo}/errors` — ServerErrorEvent (errores específicos del usuario, p. ej. rechazo de jugada). El cliente debe suscribirse a su cola de usuario.
- Envío (frontend -> backend):
  - `/app/partida/registrar` — registrar sesión con jugadorId y partidaCodigo (payload: ReconectarRequest { jugadorId, partidaCodigo }).
  - `/app/partida/{codigo}/drag` — publicar eventos de drag (PlayerDragEvent) — el backend re-broadcast a `/topic/partida/{codigo}/drag` y en caso de drop en mesa invoca internamente el play.
  - `/app/partida/{codigo}/accion` — (si se utiliza) endpoint genérico para acciones del jugador (ver controlador `GameWebSocketController` si usas acciones custom).
- REST:
  - `POST /api/partidas/{codigo}/mano/reorder` — persiste el nuevo orden de la mano del jugador. Body: { order: string[] } donde cada string es un code/id de carta. El servidor identifica al jugador por la sesión/autenticación.

Principios y contrato
---------------------
- El servidor es la fuente de verdad para `turnoActual` y `numeroCartas`. Usa `PartidaResponse` para sincronizar el panel.
- `CardCountEvent` es un refinamiento para optimizar la actualización de contadores; no reemplaza `PartidaResponse` cuando hay discrepancias.
- El backend envía `ServerErrorEvent` dirigido al usuario cuando una acción es rechazada (p. ej. jugar fuera de turno). Muestra este mensaje como feedback (toast/modal) sin alterar el estado local salvo que quieras deshacer una acción optimista.

Tip: nombres exactos de topics y endpoints
-----------------------------------------
Usar exactamente las rutas publicadas por el backend:

- Suscribir: `/topic/partida/${codigo}`
- Suscribir conteos: `/topic/partida/${codigo}/counts`
- Suscribir drag preview: `/topic/partida/${codigo}/drag`
- Usuario (errores): `/user/queue/partida/${codigo}/errors`
- Enviar drag: `/app/partida/${codigo}/drag`
- Registrar sesión: `/app/partida/registrar`
- Reorder mano (REST): `POST /api/partidas/${codigo}/mano/reorder`  body: { order: string[] }

Estructuras de datos (sugeridas en TypeScript)
---------------------------------------------
Estas interfaces ayudan a tipar los handlers. Asegúrate de inspeccionar la forma real de `PartidaResponse` si cambió, pero lo siguiente es representativo:

```ts
type JugadorDto = {
  id: string;
  nombre: string;
  orden: number; // posición en la mesa
  numeroCartas: number;
  conectado?: boolean;
};

type PartidaResponse = {
  codigo: string;
  turnoActual?: string; // jugadorId que inició la ronda
  jugadores: JugadorDto[];
  // otros campos: cartasEnMesa, historial, etc.
};

type CardCountEvent = {
  counts: Array<{ jugadorId: string; nombre?: string; count: number; orden?: number }>;
};

type ServerErrorEvent = {
  code: string; // p. ej. 'PLAY_ERROR'
  message: string;
  details?: any;
};

type PlayerDragEvent = {
  jugadorId: string;
  cardCode?: string;
  dragging: boolean;
  target?: string; // 'mesa', 'mano', etc.
  position?: { x: number; y: number };
};
```

Implementación recomendada (React + STOMP + SockJS)
--------------------------------------------------

1) Conexión y registro

 - Conecta SockJS + Stomp y al conectar envía `/app/partida/registrar` con tu `jugadorId` y `partidaCodigo` (opcional). Esto permite al servidor mapear sessionId -> jugadorId para mensajes dirigidos.

Ejemplo mínimo de conexión:

```ts
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';

export function createStomp(partidaCodigo: string, onConnect?: () => void) {
  const socket = new SockJS('/ws'); // endpoint del backend (ajusta si es otro)
  const client = new Client({
    webSocketFactory: () => socket as any,
    debug: (str) => console.debug('[STOMP]', str),
  });

  client.onConnect = frame => {
    if (onConnect) onConnect();
  };
  client.activate();
  return client;
}
```

2) Suscribirse y mantener PartidaResponse como fuente de verdad

Hook simplificado para el panel:

```ts
import { useEffect, useState, useCallback } from 'react';

export function usePartidaPanelSync(stompClient: Client | null, partidaCodigo: string, myJugadorId?: string) {
  const [jugadores, setJugadores] = useState<JugadorDto[]>([]);
  const [turnoActual, setTurnoActual] = useState<string | null>(null);

  const onPartida = useCallback((msg: any) => {
    const body: PartidaResponse = JSON.parse(msg.body);
    if (!body) return;
    setJugadores(body.jugadores.sort((a,b) => (a.orden ?? 0) - (b.orden ?? 0)));
    if (body.turnoActual) setTurnoActual(body.turnoActual);
  }, []);

  const onCounts = useCallback((msg: any) => {
    const body: CardCountEvent = JSON.parse(msg.body);
    if (!body || !body.counts) return;
    setJugadores(prev => {
      const map = new Map(prev.map(p => [p.id, {...p}]));
      for (const c of body.counts) {
        const j = map.get(c.jugadorId);
        if (j) j.numeroCartas = c.count;
      }
      return Array.from(map.values()).sort((a,b) => (a.orden ?? 0) - (b.orden ?? 0));
    });
  }, []);

  useEffect(() => {
    if (!stompClient || !stompClient.connected) return;
    const s1 = stompClient.subscribe(`/topic/partida/${partidaCodigo}`, onPartida);
    const s2 = stompClient.subscribe(`/topic/partida/${partidaCodigo}/counts`, onCounts);
    // Subscribe to user errors queue (server sends to /user/{jugadorId}/queue/partida/{codigo}/errors)
    const s3 = stompClient.subscribe(`/user/queue/partida/${partidaCodigo}/errors`, (m) => {
      const e: ServerErrorEvent = JSON.parse(m.body);
      // Mostrar toast/modal según e.code/e.message
      console.warn('Server error', e);
    });

    return () => { try { s1.unsubscribe(); s2.unsubscribe(); s3.unsubscribe(); } catch (e) {} };
  }, [stompClient, partidaCodigo, onPartida, onCounts]);

  return { jugadores, turnoActual, setJugadores, setTurnoActual };
}
```

3) Mostrar el panel

El componente `PlayersPanel` debe renderizar `jugadores` ordenados por `orden`. Resalta el `turnoActual` y muestra `numeroCartas`.

Puntos prácticos
----------------

- Optimismo y reconciliación: si aplicas acciones optimistas en el cliente (p. ej. reducir `numeroCartas` al jugar), usa `PartidaResponse` para re-sincronizar cuando llegue del servidor. No te fíes de eventos `CartaJugadaEvent` si hay posibilidad de rechazo — el servidor enviará `ServerErrorEvent` al usuario.
- Cálculo de `expectedPlayer`: para saber quién debe jugar a continuación (por ejemplo, para habilitar drag), el frontend puede mantener `cartasEnMesa.length` (escuchando `CartaJugadaEvent`) y aplicar el mismo algoritmo de rotación usado por el backend (ver `FRONTEND_TURN_HANDLER.md`). Pero la fuente de verdad final es `PartidaResponse.turnoActual` y `numeroCartas`.
- Drag->Play: el backend ya interpreta un `PlayerDragEvent` con `target == 'mesa' && dragging == false` como intento de jugar la carta y llamará a `gameService.jugarCarta(partidaCodigo, jugadorId)`. Por tanto, tu cliente puede simplemente publicar el evento drag al enviar el drop; si el servidor rechaza la jugada recibirá `ServerErrorEvent` en su cola de usuario.

Ejemplo: enviar drag-drop (simplificado)

```ts
function sendDrop(stompClient: Client, partidaCodigo: string, jugadorId: string, cardCode: string) {
  const event = { jugadorId, cardCode, dragging: false, target: 'mesa' } as PlayerDragEvent;
  stompClient.publish({ destination: `/app/partida/${partidaCodigo}/drag`, body: JSON.stringify(event) });
}
```

4) Persistir reordenación de la mano

Cuando el usuario reordena visualmente su mano (p. ej. vía drag-and-drop local), persiste la nueva secuencia en el backend para que otras reconexiones o pestañas vean el mismo orden.

- Endpoint REST: `POST /api/partidas/{codigo}/mano/reorder`
- Body: `{ "order": ["cardCode1", "cardCode2", ...] }`
- El servidor valida que la lista contenga exactamente las mismas cartas que la mano actual del jugador y publica la `PartidaResponse` actualizada.

Ejemplo fetch/axios:

```ts
await fetch(`/api/partidas/${partidaCodigo}/mano/reorder`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ order: newOrder })
});
```

5) Checklist de verificación

- [ ] El cliente se conecta a SockJS/STOMP y envía `/app/partida/registrar` con su `jugadorId`.
- [ ] El cliente está suscrito a `/topic/partida/{codigo}` y actualiza el panel con `PartidaResponse`.
- [ ] El cliente está suscrito a `/user/queue/partida/{codigo}/errors` y muestra `ServerErrorEvent` al usuario.
- [ ] Al arrastrar y hacer drop sobre la mesa el cliente publica a `/app/partida/{codigo}/drag` y maneja `ServerErrorEvent` para rechazos.
- [ ] La reordenación local de la mano se persiste mediante POST `/api/partidas/{codigo}/mano/reorder`.
- [ ] El panel muestra `numeroCartas` y `turnoActual` en tiempo real y se reconcilia con `PartidaResponse` cuando hay divergencia.

Preguntas frecuentes / casos límite
---------------------------------

- ¿Y si recibo conteos inconsistentes? Usa `PartidaResponse` para forzar el estado; `CardCountEvent` es un delta de rendimiento.
- ¿Cómo muestro que alguien está desconectado? `PartidaResponse.jugadores[].conectado` contiene el estado; actualízalo en la UI.
- ¿Qué pasa si la jugada se rechaza? El servidor envía `ServerErrorEvent` a `/user/queue/partida/{codigo}/errors`. No asumas que la jugada sucedió — espera `PartidaResponse` para confirmar.

Conclusión
----------
El flujo recomendado es: mantener conexión STOMP, suscribirse a `/topic/partida/{codigo}` como fuente de verdad, usar `/topic/partida/{codigo}/counts` para optimizaciones si hace falta, publicar drag a `/app/partida/{codigo}/drag` y persistir reorder vía REST. El backend ya implementa la validación de orden y el envío de errores dirigidos al usuario; la UI debe manejar reconciliación y feedback basado en `PartidaResponse` y `ServerErrorEvent`.

Referencias internas
-------------------
- Controlador WS drag: `PartidaWebSocketController.handleDrag` publica `/topic/partida/{codigo}/drag` y, en caso de drop sobre la mesa, llama a `gameService.jugarCarta(partidaCodigo, jugadorId)` (y envía `ServerErrorEvent` al usuario si falla).
- Endpoint reorder: `PartidaController` -> `POST /api/partidas/{codigo}/mano/reorder` (el servidor identifica el jugador autenticado).

