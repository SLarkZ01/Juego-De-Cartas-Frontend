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
