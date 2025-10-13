# Mostrar número de cartas de cada jugador en tiempo real (Next.js)

Este documento explica cómo el frontend debe suscribirse y mostrar en tiempo real el número de cartas de cada jugador usando el evento `CardCountEvent` que el backend publica en `/topic/partida/{codigo}/counts`.

Resumen rápido
- Sí: el backend ya publica `CardCountEvent` en tiempo real. Revisa `GameServiceImpl.publishCardCounts()` y la clase `CardCountEvent` en el backend.
- Dónde subscribirse (frontend): `/topic/partida/{codigo}/counts`.
- Qué contiene: una lista `counts` con objetos `{ jugadorId, nombre, count, orden }`.

## 1. Forma del evento

Clase Java: `com.juegocartas.juegocartas.dto.event.CardCountEvent`.

JSON representativo enviado por STOMP:

```json
{
  "event": "CARD_COUNTS",
  "counts": [
    { "jugadorId": "abc123", "nombre": "Thomas", "count": 16, "orden": 0 },
    { "jugadorId": "def456", "nombre": "Mondragon", "count": 16, "orden": 1 }
  ]
}
```

En los docs ya existentes (`docs/NEXTJS_JUEGO_COMPLETO.md` y `docs/REALTIME_INTEGRATION_NEXTJS.md`) hay ejemplos que usan este evento para actualizar la UI.

## 2. Suscripción en el hook WebSocket

En tu hook `useGameWebSocket` (o equivalente) debes suscribirte al tópico `/topic/partida/${codigo}/counts` y exponer un callback `onCardCount`.

Ejemplo (usando `@stomp/stompjs`):

```ts
client.subscribe(`/topic/partida/${codigo}/counts`, (message) => {
  try {
    const payload = JSON.parse(message.body);
    onCardCount?.(payload);
  } catch (e) {
    console.error('Failed to parse CardCountEvent', e);
  }
});
```

Donde `onCardCount` es una función del consumer del hook que recibirá `payload.counts`.

## 3. Integración con el componente `Oponentes`

El componente `Oponentes` debe recibir una lista de jugadores públicos (sin sus manos privadas) y un `counts` actualizado. Ejemplo de uso:

```tsx
// components/Oponentes.tsx (fragmento)
interface JugadorPublico {
  id: string;
  nombre: string;
  numeroCartas: number;
  orden: number;
}

function Oponentes({ jugadores, counts }: { jugadores: JugadorPublico[]; counts: any[] }) {
  // combinar counts con jugadores (preferir counts para numeroCartas)
  const jugadoresConCounts = jugadores.map((j) => {
    const c = counts.find((x: any) => x.jugadorId === j.id);
    return c ? { ...j, numeroCartas: c.count } : j;
  });

  return (
    <div className="oponentes">
      {jugadoresConCounts.map((jugador) => (
        <div key={jugador.id} className="oponente">
          <p>{jugador.nombre}</p>
          <p>{jugador.numeroCartas} cartas</p>
        </div>
      ))}
    </div>
  );
}
```

## 4. Ejemplo de hook + estado local

Si usas un hook centralizado (`useGameData`), guarda el `counts` y actualízalo en el callback de `useGameWebSocket`.

```ts
// Dentro de la página o hook
const [counts, setCounts] = useState<any[]>([]);

useGameWebSocket({
  codigo,
  jugadorId,
  onCardCount: (event) => {
    setCounts(event.counts);
  },
  // ...otros handlers
});

// pasar counts a Oponentes
<Oponentes jugadores={jugadoresPublicos} counts={counts} />
```

## 5. Buenas prácticas

- Preferir `CardCountEvent` como fuente de verdad para `numeroCartas` en la UI pública. El backend envía estos eventos después de iniciar partida, jugar carta y resolver ronda.
- No reconstruyas `numeroCartas` en el frontend a partir de otras operaciones; confía en el evento del backend (evita problemas por reconexiones y race conditions).
- Si el cliente se reconecta, `useGameWebSocket` debería reenviar `/app/partida/registrar` y el backend publicará inmediatamente un `PartidaResponse` y `CardCountEvent` para ese suscriptor (esto está implementado en `WebSocketEventListener`).

## 6. Verificación rápida

1. Abre dos sesiones distintas del frontend (dos navegadores/pestañas) conectadas a la misma partida.
2. Juega una carta desde la pestaña A.
3. Verifica que la pestaña B reciba un `CardCountEvent` con el nuevo `count` y que la UI actualice el número de cartas del jugador A.

Si quieres, puedo crear el hook y el componente `Oponentes` listos para copiar en tu frontend (en `src/frontend/`), o puedo implementar cambios menores en backend si detectamos falta de publicación en alguna ruta. ¿Qué prefieres?
