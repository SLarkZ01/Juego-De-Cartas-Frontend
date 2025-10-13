# Guía Completa Next.js: Implementación del Juego de Cartas

Esta guía te explica paso a paso cómo implementar el juego completo de cartas en Next.js/React después de que la partida haya iniciado, incluyendo:
- Conexión WebSocket y manejo de eventos en tiempo real
- Carga y visualización de cartas
- Flujo de selección de atributo y jugada de cartas
- Sistema de transformaciones
- Resolución de rondas y finalización del juego
- Componentes React sugeridos y hooks personalizados

---

## 1. Arquitectura general del frontend

### Estructura de datos recomendada (estado local)

```typescript
interface GameState {
  // Información de la partida
  codigo: string;
  estado: 'EN_ESPERA' | 'EN_CURSO' | 'FINALIZADA';
  turnoActual: string | null; // jugadorId
  atributoSeleccionado: string | null;
  tiempoRestante: number;
  
  // Mi jugador (privado)
  miJugador: {
    id: string;
    nombre: string;
    cartasEnMano: string[]; // códigos de cartas (ej: ["1A", "2B"])
    cartaActual: string | null; // primera carta de la mano
    numeroCartas: number;
    orden: number;
    conectado: boolean;
    transformacionActiva: string | null;
    indiceTransformacion: number; // -1 = sin transformación
  };
  
  // Otros jugadores (público - sin cartas privadas)
  jugadores: Array<{
    id: string;
    nombre: string;
    numeroCartas: number;
    orden: number;
    conectado: boolean;
    transformacionActiva: string | null;
    indiceTransformacion: number;
  }>;
  
  // Cartas en la mesa (ronda actual)
  cartasEnMesa: Array<{
    jugadorId: string;
    nombreJugador: string;
    codigoCarta: string;
    nombreCarta: string;
    imagenCarta: string;
  }>;
  
  // Datos completos de las cartas (para renderizar)
  cartasDB: Record<string, Carta>; // key = código (ej: "1A")
  
  // Estado WebSocket
  conectadoWS: boolean;
}

interface Carta {
  codigo: string;
  nombre: string;
  imagenUrl: string;
  atributos: Record<string, number>; // ej: { ki: 9500, fuerza: 8000, ... }
  transformaciones?: Array<{
    nombre: string;
    multiplicador: number;
  }>;
  planeta?: {
    nombre: string;
    imagenUrl: string;
  };
}
```

### Flujo de datos (diagrama simplificado)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Backend (Spring Boot)                         │
│  - GameService: lógica del juego                                │
│  - STOMP: publica eventos en /topic/partida/{codigo}            │
└─────────────────────────────────────────────────────────────────┘
                            ▲  │
                            │  │ WebSocket
                            │  ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Frontend (Next.js + React)                      │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ useGameWebSocket                                          │  │
│  │  - Conecta a STOMP                                        │  │
│  │  - Se suscribe a topics (/topic/partida/{codigo}, etc.)  │  │
│  │  - Maneja eventos: PARTIDA_INICIADA, CARTA_JUGADA, etc.  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                            │                                     │
│                            ▼                                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Context/Reducer: GameState                                │  │
│  │  - miJugador, jugadores, cartasEnMesa, cartasDB          │  │
│  └───────────────────────────────────────────────────────────┘  │
│                            │                                     │
│                            ▼                                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Componentes UI                                            │  │
│  │  - ManoJugador: muestra cartasEnMano                      │  │
│  │  - Mesa: muestra cartasEnMesa                             │  │
│  │  - Oponentes: muestra jugadores con cardbacks            │  │
│  │  - AtributoSelector: permite elegir atributo             │  │
│  │  - TransformacionPanel: activa/desactiva transformación  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Endpoints REST y acciones WebSocket

### Endpoints REST (GET)

| Endpoint | Método | Descripción | Respuesta |
|----------|--------|-------------|-----------|
| `/api/partidas/{codigo}/detalle?jugadorId={id}` | GET | Obtiene el estado completo de la partida con mi mano privada | `PartidaDetailResponse` |
| `/api/cartas` | GET | Lista todas las cartas disponibles (para cachear en cliente) | `Carta[]` |

### Acciones WebSocket (SEND)

| Destination | Payload | Descripción |
|-------------|---------|-------------|
| `/app/partida/registrar` | `{ jugadorId, partidaCodigo }` | Registra la sesión al conectar/reconectar |
| `/app/game/{codigo}/action` | `{ accion: "SELECCIONAR_ATRIBUTO", jugadorId, atributo }` | Selecciona atributo para la ronda |
| `/app/game/{codigo}/action` | `{ accion: "JUGAR_CARTA", jugadorId }` | Juega la carta actual (primera de la mano) |
| `/app/game/{codigo}/action` | `{ accion: "ACTIVAR_TRANSFORMACION", jugadorId, indiceTransformacion }` | Activa transformación |
| `/app/game/{codigo}/action` | `{ accion: "DESACTIVAR_TRANSFORMACION", jugadorId }` | Desactiva transformación |
| `/app/partida/{codigo}/drag` | `{ jugadorId, dragging, cardIndex?, normalizedX?, normalizedY?, target? }` | Evento drag preview (opcional) |

### Eventos WebSocket recibidos (SUBSCRIBE `/topic/partida/{codigo}`)

| Evento | Campos principales | Cuándo se emite |
|--------|-------------------|-----------------|
| `PARTIDA_INICIADA` | `turnoActual`, `nombreJugadorTurno`, `tiempoLimiteSegundos` | Al iniciar la partida |
| `ATRIBUTO_SELECCIONADO` | `jugadorId`, `nombreJugador`, `atributo` | Cuando un jugador elige atributo |
| `CARTA_JUGADA` | `jugadorId`, `nombreJugador`, `codigoCarta`, `nombreCarta`, `imagenCarta` | Cuando un jugador juega carta |
| `RONDA_RESUELTA` | `ganadorId`, `nombreGanador`, `atributoUsado`, `valorGanador`, `resultados[]`, `empate` | Cuando todos jugaron y se resuelve ronda |
| `TRANSFORMACION_ACTIVADA` | `jugadorId`, `nombreJugador`, `nombreTransformacion`, `multiplicador` | Cuando se activa transformación |
| `TRANSFORMACION_DESACTIVADA` | `jugadorId`, `nombreJugador`, `nombreTransformacion` | Cuando se desactiva transformación |
| `JUEGO_FINALIZADO` | `ganadorId`, `nombreGanador`, `razon`, `empate` | Cuando termina el juego |

### Eventos en subtopics

| Topic | Evento | Campos | Cuándo |
|-------|--------|--------|--------|
| `/topic/partida/{codigo}/counts` | `CardCountEvent` | `counts: [{ jugadorId, nombre, count, orden }]` | Después de iniciar, jugar carta, resolver ronda |
| `/topic/partida/{codigo}/drag` | `PlayerDragEvent` | `jugadorId`, `dragging`, `cardIndex`, `normalizedX/Y`, `target` | Durante drag de carta (opcional) |

---

## 3. Flujo del juego paso a paso

### 3.1 Inicio de la partida y carga de cartas

**Backend:**
1. Usuario pulsa "Iniciar Partida" → `POST /api/partidas/{codigo}/iniciar`.
2. Backend reparte cartas, establece `estado = EN_CURSO`, `turnoActual`.
3. Publica `PartidaIniciadaEvent` en `/topic/partida/{codigo}`.
4. Publica `CardCountEvent` en `/topic/partida/{codigo}/counts`.

**Frontend:**
1. Al recibir `PartidaIniciadaEvent`:
   - Llamar `GET /api/partidas/{codigo}/detalle?jugadorId={miId}`.
   - Actualizar `miJugador.cartasEnMano` con la respuesta.
   - Actualizar `turnoActual` con el jugador que tiene el primer turno.
2. Al recibir `CardCountEvent`:
   - Actualizar `jugadores[].numeroCartas` para mostrar card backs a oponentes.
3. Cachear cartas:
   - Llamar `GET /api/cartas` y guardar en `cartasDB` para renderizar imágenes/atributos.

### 3.2 Selección de atributo (jugador con turno)

**Flujo:**
1. Si `miJugador.id === turnoActual` y `atributoSeleccionado === null`:
   - Mostrar `AtributoSelector` con opciones (ej: "ki", "fuerza", "resistencia", etc.).
2. Usuario selecciona atributo → enviar mensaje WebSocket:
   ```typescript
   stompClient.publish({
     destination: `/app/game/${codigo}/action`,
     body: JSON.stringify({
       accion: "SELECCIONAR_ATRIBUTO",
       jugadorId: miJugador.id,
       atributo: "ki" // atributo elegido
     })
   });
   ```
3. Backend valida, actualiza `partida.atributoSeleccionado`, publica `AtributoSeleccionadoEvent`.
4. Frontend recibe evento → actualiza `atributoSeleccionado` en estado local → UI muestra el atributo elegido y espera que todos jueguen.

### 3.3 Jugada de carta

**Flujo:**
1. Todos los jugadores con cartas deben jugar su `cartaActual` (primera de la mano).
2. Usuario hace clic en su carta (o botón "Jugar Carta"):
   ```typescript
   stompClient.publish({
     destination: `/app/game/${codigo}/action`,
     body: JSON.stringify({
       accion: "JUGAR_CARTA",
       jugadorId: miJugador.id
     })
   });
   ```
3. Backend:
   - Retira la carta de `miJugador.cartasEnMano` (primera posición).
   - Calcula el valor del atributo seleccionado (aplica multiplicador si hay transformación activa).
   - Agrega `CartaEnMesa` a `partida.cartasEnMesa`.
   - Publica `CartaJugadaEvent` con datos completos de la carta.
   - Publica `CardCountEvent` actualizado (el jugador tiene 1 carta menos).
4. Frontend recibe `CartaJugadaEvent`:
   - Agrega la carta a `cartasEnMesa` (renderizar en la mesa con imagen/nombre).
5. Cuando todos jugaron → backend resuelve ronda automáticamente.

### 3.4 Resolución de ronda

**Backend:**
1. Compara valores del atributo seleccionado.
2. Determina ganador (o empate).
3. Asigna cartas de la mesa al ganador (al final de su mano).
4. Limpia `cartasEnMesa` y `atributoSeleccionado`.
5. Actualiza `turnoActual` (ganador tiene el siguiente turno; si empate, mantiene turno actual).
6. Publica `RondaResueltaEvent` con todos los `resultados[]` (jugadorId, carta, valor).
7. Publica `CardCountEvent` actualizado (ganador tiene más cartas).

**Frontend:**
1. Recibe `RondaResueltaEvent`:
   - Mostrar animación/resultado de la ronda (ganador destacado, valores comparados).
   - Limpiar `cartasEnMesa`.
   - Actualizar `turnoActual` con el nuevo turno.
   - Resetear `atributoSeleccionado = null`.
2. Recibe `CardCountEvent`:
   - Actualizar conteos de cartas de todos los jugadores.
3. Volver a pedir detalle para sincronizar mano:
   ```typescript
   const detalle = await fetch(`/api/partidas/${codigo}/detalle?jugadorId=${miJugador.id}`);
   const data = await detalle.json();
   setMiJugador({ ...miJugador, cartasEnMano: data.miJugador.cartasEnMano });
   ```

### 3.5 Transformaciones (opcional)

**Activar transformación:**
1. Si la `cartaActual` tiene `transformaciones[]`:
   - Mostrar `TransformacionPanel` con lista de transformaciones disponibles.
2. Usuario selecciona transformación (índice):
   ```typescript
   stompClient.publish({
     destination: `/app/game/${codigo}/action`,
     body: JSON.stringify({
       accion: "ACTIVAR_TRANSFORMACION",
       jugadorId: miJugador.id,
       indiceTransformacion: 0 // índice de la transformación elegida
     })
   });
   ```
3. Backend valida, aplica multiplicador, publica `TransformacionEvent` (activada).
4. Frontend recibe evento:
   - Actualizar `miJugador.transformacionActiva` y `miJugador.indiceTransformacion`.
   - UI muestra efecto visual (ej: aura dorada, texto "SSJ x1.5").

**Desactivar transformación:**
```typescript
stompClient.publish({
  destination: `/app/game/${codigo}/action`,
  body: JSON.stringify({
    accion: "DESACTIVAR_TRANSFORMACION",
    jugadorId: miJugador.id
  })
});
```
- Backend resetea transformación, publica `TransformacionEvent` (desactivada).

### 3.6 Finalización del juego

**Backend:**
1. Detecta que solo queda 1 jugador con cartas (o tiempo límite alcanzado).
2. Determina ganador (o empate).
3. Marca `partida.estado = FINALIZADA`.
4. Publica `JuegoFinalizadoEvent`.

**Frontend:**
1. Recibe `JuegoFinalizadoEvent`:
   - Actualizar `estado = FINALIZADA`.
   - Mostrar pantalla de resultados con `ganadorId`, `nombreGanador`, `razon`.
   - Opcionalmente mostrar historial de rondas (pedir `GET /api/partidas/{codigo}`).

---

## 4. Hook personalizado: `useGameWebSocket`

Este hook maneja toda la lógica de conexión WebSocket y eventos del juego.

### Estructura del hook

```typescript
// hooks/useGameWebSocket.ts
import { useEffect, useRef, useState, useCallback } from 'react';
import { Client, IMessage } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

interface UseGameWebSocketProps {
  codigo: string;
  jugadorId: string;
  onPartidaIniciada?: (event: any) => void;
  onAtributoSeleccionado?: (event: any) => void;
  onCartaJugada?: (event: any) => void;
  onRondaResuelta?: (event: any) => void;
  onTransformacion?: (event: any) => void;
  onJuegoFinalizado?: (event: any) => void;
  onCardCount?: (event: any) => void;
  onPlayerDrag?: (event: any) => void;
}

export function useGameWebSocket({
  codigo,
  jugadorId,
  onPartidaIniciada,
  onAtributoSeleccionado,
  onCartaJugada,
  onRondaResuelta,
  onTransformacion,
  onJuegoFinalizado,
  onCardCount,
  onPlayerDrag,
}: UseGameWebSocketProps) {
  const [conectado, setConectado] = useState(false);
  const clientRef = useRef<Client | null>(null);

  useEffect(() => {
    // Crear cliente STOMP con SockJS
    const client = new Client({
      webSocketFactory: () => new SockJS(`${process.env.NEXT_PUBLIC_API_URL}/ws`),
      reconnectDelay: 2000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
      
      onConnect: () => {
        console.log('🟢 WebSocket conectado');
        setConectado(true);

        // Registrar sesión
        client.publish({
          destination: '/app/partida/registrar',
          body: JSON.stringify({ jugadorId, partidaCodigo: codigo })
        });

        // Suscribirse a topic principal
        client.subscribe(`/topic/partida/${codigo}`, (message: IMessage) => {
          const payload = JSON.parse(message.body);
          console.log('📨 Evento recibido:', payload);

          switch (payload.event) {
            case 'PARTIDA_INICIADA':
              onPartidaIniciada?.(payload);
              break;
            case 'ATRIBUTO_SELECCIONADO':
              onAtributoSeleccionado?.(payload);
              break;
            case 'CARTA_JUGADA':
              onCartaJugada?.(payload);
              break;
            case 'RONDA_RESUELTA':
              onRondaResuelta?.(payload);
              break;
            case 'TRANSFORMACION_ACTIVADA':
            case 'TRANSFORMACION_DESACTIVADA':
              onTransformacion?.(payload);
              break;
            case 'JUEGO_FINALIZADO':
              onJuegoFinalizado?.(payload);
              break;
          }
        });

        // Suscribirse a card counts
        client.subscribe(`/topic/partida/${codigo}/counts`, (message: IMessage) => {
          const payload = JSON.parse(message.body);
          onCardCount?.(payload);
        });

        // Suscribirse a drag events (opcional)
        client.subscribe(`/topic/partida/${codigo}/drag`, (message: IMessage) => {
          const payload = JSON.parse(message.body);
          onPlayerDrag?.(payload);
        });
      },

      onDisconnect: () => {
        console.log('🔴 WebSocket desconectado');
        setConectado(false);
      },

      onStompError: (frame) => {
        console.error('❌ Error STOMP:', frame);
      },
    });

    clientRef.current = client;
    client.activate();

    return () => {
      client.deactivate();
    };
  }, [codigo, jugadorId]);

  // Funciones para enviar acciones
  const seleccionarAtributo = useCallback((atributo: string) => {
    if (!clientRef.current?.connected) return;
    clientRef.current.publish({
      destination: `/app/game/${codigo}/action`,
      body: JSON.stringify({
        accion: 'SELECCIONAR_ATRIBUTO',
        jugadorId,
        atributo,
      }),
    });
  }, [codigo, jugadorId]);

  const jugarCarta = useCallback(() => {
    if (!clientRef.current?.connected) return;
    clientRef.current.publish({
      destination: `/app/game/${codigo}/action`,
      body: JSON.stringify({
        accion: 'JUGAR_CARTA',
        jugadorId,
      }),
    });
  }, [codigo, jugadorId]);

  const activarTransformacion = useCallback((indiceTransformacion: number) => {
    if (!clientRef.current?.connected) return;
    clientRef.current.publish({
      destination: `/app/game/${codigo}/action`,
      body: JSON.stringify({
        accion: 'ACTIVAR_TRANSFORMACION',
        jugadorId,
        indiceTransformacion,
      }),
    });
  }, [codigo, jugadorId]);

  const desactivarTransformacion = useCallback(() => {
    if (!clientRef.current?.connected) return;
    clientRef.current.publish({
      destination: `/app/game/${codigo}/action`,
      body: JSON.stringify({
        accion: 'DESACTIVAR_TRANSFORMACION',
        jugadorId,
      }),
    });
  }, [codigo, jugadorId]);

  return {
    conectado,
    seleccionarAtributo,
    jugarCarta,
    activarTransformacion,
    desactivarTransformacion,
  };
}
```

---

## 5. Componentes React sugeridos

### 5.1 Componente: `ManoJugador`

Muestra las cartas en la mano del jugador con imágenes y permite jugar.

```typescript
// components/ManoJugador.tsx
interface ManoJugadorProps {
  cartasEnMano: string[]; // códigos: ["1A", "2B"]
  cartasDB: Record<string, Carta>;
  cartaActual: string | null;
  esMiTurno: boolean;
  atributoSeleccionado: string | null;
  onJugarCarta: () => void;
}

export function ManoJugador({
  cartasEnMano,
  cartasDB,
  cartaActual,
  esMiTurno,
  atributoSeleccionado,
  onJugarCarta,
}: ManoJugadorProps) {
  return (
    <div className="mano-jugador">
      <h3>Mi Mano ({cartasEnMano.length} cartas)</h3>
      <div className="cartas-container">
        {cartasEnMano.map((codigo, index) => {
          const carta = cartasDB[codigo];
          if (!carta) return null;

          const esCartaActual = codigo === cartaActual;
          const puedeJugar = esCartaActual && esMiTurno && atributoSeleccionado !== null;

          return (
            <div
              key={codigo}
              className={`carta ${esCartaActual ? 'actual' : ''} ${puedeJugar ? 'jugable' : ''}`}
              onClick={() => puedeJugar && onJugarCarta()}
            >
              <img src={carta.imagenUrl} alt={carta.nombre} />
              <div className="carta-info">
                <p>{carta.nombre}</p>
                <p>Código: {carta.codigo}</p>
              </div>
            </div>
          );
        })}
      </div>
      {esMiTurno && atributoSeleccionado && (
        <button onClick={onJugarCarta} className="btn-jugar">
          Jugar Carta Actual
        </button>
      )}
    </div>
  );
}
```

#### 5.1.1 Implementación recomendada: `components/game/ManoJugador.tsx`

He incluido un componente listo para usar `components/game/ManoJugador.tsx` en el repositorio. Resumen de la implementación:

- Recibe `cartasCodigos: string[]` (la lista ordenada de códigos del jugador) y `cartasDB: Record<string, Carta>` con los datos de cada carta.
- Renderiza una fila horizontal con `overflow-x` para soportar cualquier número de cartas.
- Cada carta es renderizada usando `CartaComponent` (la plantilla `CartaNormal.webp`), y tiene `onClick` para jugarla si se requiere.
- Usa `flex-shrink-0` para evitar que las cartas se reduzcan y permite scroll; `mostrarMini` cambia el ancho para vistas compactas.

Código de ejemplo de uso:

```tsx
import ManoJugador from '@/components/game/ManoJugador';

function MiZona({ gameState, jugadorId, enviarJugada }) {
  const mi = gameState.miJugador;

  return (
    <div>
      <ManoJugador
        cartasCodigos={mi.cartasEnMano}
        cartasDB={gameState.cartasDB}
        onJugarCarta={(codigo) => enviarJugada({ accion: 'JUGAR_CARTA', jugadorId, codigo })}
        mostrarMini={false}
      />
    </div>
  );
}
```

Recomendaciones para el layout:

- Mantener un `max-width` por carta (ej. `w-40`) y usar `overflow-x-auto` para la fila; así la UI es predecible con 2, 8 o 16 cartas.
- Ofrecer una vista compacta (`mostrarMini`) en móviles o cuando la mano exceda un umbral (p. ej. > 10 cartas) para mejorar la navegación.
- Para accesibilidad y teclado, cada carta debe tener `role="button"` y `tabIndex` cuando sea clicable.

Sincronización con backend / DB:

- Como muestra la captura de la base de datos, cuando hay 2 jugadores las 32 cartas se reparten en 16/16. Frontend debe recibir `miJugador.cartasEnMano` desde `GET /api/partidas/{codigo}/detalle?jugadorId={miId}`.
- Cada carta se identifica por su `codigo` único (ej. `2H`, `3A`), usa esto como `key` y para pedir los detalles en `cartasDB`.

Escalado y variantes:

- Grid en lugar de fila: para pantallas de mesa (tablet/desktop) puede ser útil convertir la tira en varias filas (grid) si prefieres mostrar más cartas sin scroll.
- Agrupación visual: cuando haya muchas cartas, puedes agrupar por paquete/país/raridad y mostrar un contador en cada grupo.


### 5.2 Componente: `Mesa`

Muestra las cartas jugadas en la ronda actual.

```typescript
// components/Mesa.tsx
interface MesaProps {
  cartasEnMesa: Array<{
    jugadorId: string;
    nombreJugador: string;
    codigoCarta: string;
    nombreCarta: string;
    imagenCarta: string;
  }>;
  atributoSeleccionado: string | null;
}

export function Mesa({ cartasEnMesa, atributoSeleccionado }: MesaProps) {
  return (
    <div className="mesa">
      <h3>Mesa</h3>
      {atributoSeleccionado && (
        <p className="atributo-seleccionado">
          Atributo: <strong>{atributoSeleccionado}</strong>
        </p>
      )}
      <div className="cartas-jugadas">
        {cartasEnMesa.map((carta, index) => (
          <div key={index} className="carta-mesa">
            <img src={carta.imagenCarta} alt={carta.nombreCarta} />
            <p>{carta.nombreJugador}</p>
            <p>{carta.nombreCarta}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 5.3 Componente: `AtributoSelector`

Permite al jugador con turno seleccionar el atributo.

```typescript
// components/AtributoSelector.tsx
interface AtributoSelectorProps {
  esMiTurno: boolean;
  atributoSeleccionado: string | null;
  atributosDisponibles: string[]; // ["ki", "fuerza", "resistencia", ...]
  onSeleccionar: (atributo: string) => void;
}

export function AtributoSelector({
  esMiTurno,
  atributoSeleccionado,
  atributosDisponibles,
  onSeleccionar,
}: AtributoSelectorProps) {
  if (!esMiTurno || atributoSeleccionado !== null) return null;

  return (
    <div className="atributo-selector">
      <h3>Selecciona un atributo</h3>
      <div className="atributos">
        {atributosDisponibles.map((atributo) => (
          <button
            key={atributo}
            onClick={() => onSeleccionar(atributo)}
            className="btn-atributo"
          >
            {atributo.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}
```

### 5.4 Componente: `TransformacionPanel`

Permite activar/desactivar transformaciones.

```typescript
// components/TransformacionPanel.tsx
interface TransformacionPanelProps {
  cartaActual: string | null;
  cartasDB: Record<string, Carta>;
  transformacionActiva: string | null;
  indiceTransformacion: number;
  onActivar: (indice: number) => void;
  onDesactivar: () => void;
}

export function TransformacionPanel({
  cartaActual,
  cartasDB,
  transformacionActiva,
  indiceTransformacion,
  onActivar,
  onDesactivar,
}: TransformacionPanelProps) {
  if (!cartaActual) return null;

  const carta = cartasDB[cartaActual];
  if (!carta || !carta.transformaciones || carta.transformaciones.length === 0) {
    return null;
  }

  return (
    <div className="transformacion-panel">
      <h3>Transformaciones</h3>
      {transformacionActiva ? (
        <div className="transformacion-activa">
          <p>Transformación activa: <strong>{transformacionActiva}</strong></p>
          <p>Multiplicador: x{carta.transformaciones[indiceTransformacion]?.multiplicador}</p>
          <button onClick={onDesactivar} className="btn-desactivar">
            Desactivar
          </button>
        </div>
      ) : (
        <div className="transformaciones-disponibles">
          {carta.transformaciones.map((t, index) => (
            <button
              key={index}
              onClick={() => onActivar(index)}
              className="btn-transformacion"
            >
              {t.nombre} (x{t.multiplicador})
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

### 5.5 Componente: `Oponentes`

Muestra los otros jugadores con card backs (reverso de cartas).

```typescript
// components/Oponentes.tsx
interface OponentesProps {
  jugadores: Array<{
    id: string;
    nombre: string;
    numeroCartas: number;
    orden: number;
    conectado: boolean;
    transformacionActiva: string | null;
  }>;
  turnoActual: string | null;
}

export function Oponentes({ jugadores, turnoActual }: OponentesProps) {
  return (
    <div className="oponentes">
      {jugadores.map((jugador) => (
        <div
          key={jugador.id}
          className={`oponente ${jugador.id === turnoActual ? 'turno-activo' : ''} ${!jugador.conectado ? 'desconectado' : ''}`}
        >
          <div className="jugador-info">
            <p className="nombre">{jugador.nombre}</p>
            {jugador.transformacionActiva && (
              <p className="transformacion">⚡ {jugador.transformacionActiva}</p>
            )}
          </div>
          <div className="cartas-oponente">
            {Array.from({ length: jugador.numeroCartas }).map((_, i) => (
              <div key={i} className="card-back">🃏</div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

---

## 6. Ejemplo de página completa: `pages/partida/[codigo].tsx`

```typescript
// pages/partida/[codigo].tsx
import { useRouter } from 'next/router';
import { useEffect, useState, useCallback } from 'react';
import { useGameWebSocket } from '@/hooks/useGameWebSocket';
import { ManoJugador } from '@/components/ManoJugador';
import { Mesa } from '@/components/Mesa';
import { AtributoSelector } from '@/components/AtributoSelector';
import { TransformacionPanel } from '@/components/TransformacionPanel';
import { Oponentes } from '@/components/Oponentes';

export default function PartidaPage() {
  const router = useRouter();
  const { codigo } = router.query;
  const [jugadorId, setJugadorId] = useState<string>(''); // desde localStorage o auth

  const [gameState, setGameState] = useState<GameState>({
    codigo: codigo as string,
    estado: 'EN_CURSO',
    turnoActual: null,
    atributoSeleccionado: null,
    tiempoRestante: 1800,
    miJugador: null,
    jugadores: [],
    cartasEnMesa: [],
    cartasDB: {},
    conectadoWS: false,
  });

  // Hook WebSocket
  const {
    conectado,
    seleccionarAtributo,
    jugarCarta,
    activarTransformacion,
    desactivarTransformacion,
  } = useGameWebSocket({
    codigo: codigo as string,
    jugadorId,
    
    onPartidaIniciada: async (event) => {
      console.log('🎮 Partida iniciada:', event);
      setGameState((prev) => ({ ...prev, turnoActual: event.turnoActual }));

      // Obtener mi mano privada
      const res = await fetch(`/api/partidas/${codigo}/detalle?jugadorId=${jugadorId}`);
      const data = await res.json();
      setGameState((prev) => ({
        ...prev,
        miJugador: data.miJugador,
        jugadores: data.jugadoresPublicos,
      }));
    },

    onAtributoSeleccionado: (event) => {
      console.log('🎯 Atributo seleccionado:', event.atributo);
      setGameState((prev) => ({ ...prev, atributoSeleccionado: event.atributo }));
    },

    onCartaJugada: (event) => {
      console.log('🃏 Carta jugada:', event);
      setGameState((prev) => ({
        ...prev,
        cartasEnMesa: [
          ...prev.cartasEnMesa,
          {
            jugadorId: event.jugadorId,
            nombreJugador: event.nombreJugador,
            codigoCarta: event.codigoCarta,
            nombreCarta: event.nombreCarta,
            imagenCarta: event.imagenCarta,
          },
        ],
      }));
    },

    onRondaResuelta: async (event) => {
      console.log('🏆 Ronda resuelta:', event);
      
      // Mostrar resultados brevemente
      alert(event.empate ? 'Empate!' : `Ganador: ${event.nombreGanador}`);

      // Limpiar mesa y actualizar turno
      setGameState((prev) => ({
        ...prev,
        cartasEnMesa: [],
        atributoSeleccionado: null,
        turnoActual: event.ganadorId || prev.turnoActual,
      }));

      // Re-obtener detalle para sincronizar mano
      const res = await fetch(`/api/partidas/${codigo}/detalle?jugadorId=${jugadorId}`);
      const data = await res.json();
      setGameState((prev) => ({
        ...prev,
        miJugador: data.miJugador,
      }));
    },

    onTransformacion: (event) => {
      console.log('⚡ Transformación:', event);
      if (event.jugadorId === jugadorId) {
        setGameState((prev) => ({
          ...prev,
          miJugador: {
            ...prev.miJugador!,
            transformacionActiva: event.activada ? event.nombreTransformacion : null,
            indiceTransformacion: event.activada ? prev.miJugador!.indiceTransformacion : -1,
          },
        }));
      } else {
        setGameState((prev) => ({
          ...prev,
          jugadores: prev.jugadores.map((j) =>
            j.id === event.jugadorId
              ? { ...j, transformacionActiva: event.activada ? event.nombreTransformacion : null }
              : j
          ),
        }));
      }
    },

    onJuegoFinalizado: (event) => {
      console.log('🎉 Juego finalizado:', event);
      alert(event.empate ? 'Empate final!' : `Ganador final: ${event.nombreGanador}`);
      setGameState((prev) => ({ ...prev, estado: 'FINALIZADA' }));
    },

    onCardCount: (event) => {
      console.log('📊 Card counts:', event.counts);
      setGameState((prev) => ({
        ...prev,
        jugadores: prev.jugadores.map((j) => {
          const count = event.counts.find((c: any) => c.jugadorId === j.id);
          return count ? { ...j, numeroCartas: count.count } : j;
        }),
      }));
    },
  });

  // Cargar cartas al montar
  useEffect(() => {
    fetch('/api/cartas')
      .then((res) => res.json())
      .then((cartas) => {
        const cartasDB = cartas.reduce((acc: any, carta: any) => {
          acc[carta.codigo] = carta;
          return acc;
        }, {});
        setGameState((prev) => ({ ...prev, cartasDB }));
      });
  }, []);

  const esMiTurno = gameState.miJugador?.id === gameState.turnoActual;

  return (
    <div className="partida-page">
      <h1>Partida: {codigo}</h1>
      <p>Estado: {conectado ? '🟢 Conectado' : '🔴 Desconectado'}</p>

      <AtributoSelector
        esMiTurno={esMiTurno}
        atributoSeleccionado={gameState.atributoSeleccionado}
        atributosDisponibles={['ki', 'fuerza', 'resistencia', 'velocidad']}
        onSeleccionar={seleccionarAtributo}
      />

      <Mesa
        cartasEnMesa={gameState.cartasEnMesa}
        atributoSeleccionado={gameState.atributoSeleccionado}
      />

      {gameState.miJugador && (
        <>
          <ManoJugador
            cartasEnMano={gameState.miJugador.cartasEnMano}
            cartasDB={gameState.cartasDB}
            cartaActual={gameState.miJugador.cartaActual}
            esMiTurno={esMiTurno}
            atributoSeleccionado={gameState.atributoSeleccionado}
            onJugarCarta={jugarCarta}
          />

          <TransformacionPanel
            cartaActual={gameState.miJugador.cartaActual}
            cartasDB={gameState.cartasDB}
            transformacionActiva={gameState.miJugador.transformacionActiva}
            indiceTransformacion={gameState.miJugador.indiceTransformacion}
            onActivar={activarTransformacion}
            onDesactivar={desactivarTransformacion}
          />
        </>
      )}

      <Oponentes jugadores={gameState.jugadores} turnoActual={gameState.turnoActual} />
    </div>
  );
}
```

---

## 7. Manejo de errores y edge cases

### Reconexión automática
- STOMP ya maneja reconexión con `reconnectDelay: 2000`.
- Al reconectarse, reenviar `/app/partida/registrar` y llamar `GET /detalle` para sincronizar.

### Sincronización tras ronda
- Siempre pedir `GET /detalle` después de `RondaResueltaEvent` para asegurar que `cartasEnMano` esté actualizado.

### Validación de datos
- Validar que `cartasDB[codigo]` existe antes de renderizar.
- Manejar casos donde `miJugador.cartasEnMano` esté vacío (jugador perdió).

### Tiempo límite
- Mostrar un timer con `tiempoRestante` (cuenta regresiva).
- Al recibir `JuegoFinalizadoEvent` con `razon === "TIEMPO_LIMITE"`, mostrar mensaje específico.

---

## 8. Optimizaciones y mejores prácticas

### Cacheo de imágenes
- Cargar todas las cartas (`GET /api/cartas`) una sola vez al inicio.
- Usar `next/image` para optimizar carga.

### Throttling de eventos drag
- Si usas drag preview, aplicar throttling (max 20 eventos/s como en el backend).

### Estado global con Context
- Usar Context API o Zustand para compartir `gameState` entre componentes.

### Animaciones
- Usar `framer-motion` para animar cartas jugadas, rondas resueltas, transformaciones.

### Tests
- Probar handlers de eventos con mock de STOMP.
- Validar flujo completo con Playwright o Cypress.

---

## 9. Resumen de pasos para implementar

1. **Setup inicial:**
   - Instalar `@stomp/stompjs`, `sockjs-client`.
   - Crear hook `useGameWebSocket`.

2. **Cargar estado inicial:**
   - Al recibir `PARTIDA_INICIADA`, pedir `GET /detalle`.
   - Cachear `GET /api/cartas`.

3. **Implementar componentes:**
   - `ManoJugador`, `Mesa`, `AtributoSelector`, `TransformacionPanel`, `Oponentes`.

4. **Conectar eventos:**
   - Manejar cada evento (`ATRIBUTO_SELECCIONADO`, `CARTA_JUGADA`, etc.) y actualizar estado.

5. **Probar flujo completo:**
   - Abrir 2-3 pestañas con distintos jugadores y jugar una partida completa.

---

¿Necesitas que genere algún componente adicional, un ejemplo de tests, o que adapte algo específico de tu frontend actual?
