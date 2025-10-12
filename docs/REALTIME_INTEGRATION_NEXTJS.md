# Integración WebSocket Realtime - Next.js

Esta guía explica cómo integrar las funcionalidades de **card counts** y **drag preview** en tiempo real desde Next.js usando STOMP sobre WebSocket.

## 📋 Tabla de Contenidos

1. [Arquitectura General](#arquitectura-general)
2. [Configuración del Cliente STOMP](#configuración-del-cliente-stomp)
3. [Hook React para WebSocket](#hook-react-para-websocket)
4. [Eventos del Backend](#eventos-del-backend)
5. [Componente de Card Counts](#componente-de-card-counts)
6. [Componente de Drag Preview](#componente-de-drag-preview)
7. [Ejemplo Completo](#ejemplo-completo)
8. [Optimizaciones de Rendimiento](#optimizaciones-de-rendimiento)

---

## 🏗️ Arquitectura General

### Flujo de Comunicación

```
Frontend (Next.js)          Backend (Spring Boot)
     │                             │
     ├──────► STOMP Connect ──────►│
     │                             │
     ├──► Subscribe /topic/.../counts
     ├──► Subscribe /topic/.../drag
     │                             │
     ◄──── CARD_COUNTS Event ◄─────┤
     ◄──── PLAYER_DRAG Event ◄─────┤
     │                             │
     ├─► Send drag update ─────────►│
     │                        (validate)
     ◄──── Broadcast to all ◄──────┤
```

### Topics Disponibles

| Topic | Descripción | Frecuencia |
|-------|-------------|-----------|
| `/topic/partida/{codigo}/counts` | Conteo de cartas de jugadores | Al cambiar # cartas |
| `/topic/partida/{codigo}/drag` | Preview de arrastre de cartas | Hasta 20 msg/s/jugador |
| `/topic/partida/{codigo}` | Eventos generales de partida | Variable |

---

## ⚙️ Configuración del Cliente STOMP

### Instalación de Dependencias

```bash
npm install @stomp/stompjs sockjs-client
# o
yarn add @stomp/stompjs sockjs-client
# o
pnpm add @stomp/stompjs sockjs-client
```

### Cliente STOMP con SockJS

```typescript
// lib/stomp-client.ts
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

export function createStompClient(
  serverUrl: string,
  onConnect: () => void,
  onError: (error: any) => void
): Client {
  const client = new Client({
    webSocketFactory: () => new SockJS(serverUrl),
    debug: (str) => {
      console.log('[STOMP]', str);
    },
    reconnectDelay: 5000,
    heartbeatIncoming: 4000,
    heartbeatOutgoing: 4000,
    onConnect,
    onStompError: onError,
  });

  return client;
}
```

---

## 🪝 Hook React para WebSocket

### Hook Base: `useGameWebSocket`

```typescript
// hooks/useGameWebSocket.ts
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Client, IMessage } from '@stomp/stompjs';
import { createStompClient } from '@/lib/stomp-client';

interface UseGameWebSocketOptions {
  serverUrl: string;
  partidaCodigo: string;
  jugadorId: string;
  onCardCounts?: (counts: CardCountEvent) => void;
  onDragEvent?: (drag: PlayerDragEvent) => void;
  onGameEvent?: (event: any) => void;
}

export interface CardCountEvent {
  tipo: 'CARD_COUNTS';
  timestamp: string;
  counts: Array<{
    jugadorId: string;
    nombre: string;
    count: number;
    orden: number;
  }>;
}

export interface PlayerDragEvent {
  tipo: 'PLAYER_DRAG';
  timestamp: string;
  jugadorId: string;
  jugadorNombre: string;
  dragging: boolean;
  cardIndex?: number;
  normalizedX?: number;
  normalizedY?: number;
  target?: string;
}

export function useGameWebSocket(options: UseGameWebSocketOptions) {
  const {
    serverUrl,
    partidaCodigo,
    jugadorId,
    onCardCounts,
    onDragEvent,
    onGameEvent,
  } = options;

  const clientRef = useRef<Client | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Enviar evento de drag
  const sendDragEvent = useCallback(
    (event: Omit<PlayerDragEvent, 'tipo' | 'timestamp'>) => {
      if (!clientRef.current?.connected) {
        console.warn('STOMP client not connected');
        return;
      }

      const payload = {
        ...event,
        jugadorId,
      };

      clientRef.current.publish({
        destination: `/app/partida/${partidaCodigo}/drag`,
        body: JSON.stringify(payload),
      });
    },
    [partidaCodigo, jugadorId]
  );

  useEffect(() => {
    // Crear cliente STOMP
    const client = createStompClient(
      serverUrl,
      () => {
        console.log('WebSocket conectado');
        setIsConnected(true);
        setError(null);

        // Registrar jugador y partida
        client.publish({
          destination: '/app/partida/registrar',
          body: JSON.stringify({
            jugadorId,
            partidaCodigo,
          }),
        });

        // Suscribirse a eventos de card counts
        client.subscribe(
          `/topic/partida/${partidaCodigo}/counts`,
          (message: IMessage) => {
            const event: CardCountEvent = JSON.parse(message.body);
            onCardCounts?.(event);
          }
        );

        // Suscribirse a eventos de drag
        client.subscribe(
          `/topic/partida/${partidaCodigo}/drag`,
          (message: IMessage) => {
            const event: PlayerDragEvent = JSON.parse(message.body);
            onDragEvent?.(event);
          }
        );

        // Suscribirse a eventos generales
        client.subscribe(
          `/topic/partida/${partidaCodigo}`,
          (message: IMessage) => {
            const event = JSON.parse(message.body);
            onGameEvent?.(event);
          }
        );
      },
      (err) => {
        console.error('WebSocket error:', err);
        setError(err.toString());
        setIsConnected(false);
      }
    );

    client.activate();
    clientRef.current = client;

    return () => {
      client.deactivate();
    };
  }, [
    serverUrl,
    partidaCodigo,
    jugadorId,
    onCardCounts,
    onDragEvent,
    onGameEvent,
  ]);

  return {
    isConnected,
    error,
    sendDragEvent,
  };
}
```

---

## 📊 Eventos del Backend

### Evento: CARD_COUNTS

**Cuándo se emite:**
- Al iniciar partida (repartir cartas)
- Después de que un jugador juega una carta
- Después de resolver una ronda (redistribución)

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

### Evento: PLAYER_DRAG

**Cuándo se emite:**
- Cuando un jugador arrastra una carta (retransmitido por el servidor)
- Throttled a max 20 eventos/segundo por jugador

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
- `cardIndex`: Índice de la carta en la mano (solo para UX, no revela la carta)
- `normalizedX/Y`: Posición normalizada 0.0-1.0 (independiente de resolución)
- `target`: "mesa", "mano", o null

---

## 🎴 Componente de Card Counts

```typescript
// components/PlayerCardCount.tsx
'use client';

import { CardCountEvent } from '@/hooks/useGameWebSocket';
import Image from 'next/image';

interface PlayerCardCountProps {
  counts: CardCountEvent['counts'];
  currentJugadorId: string;
}

export function PlayerCardCount({ counts, currentJugadorId }: PlayerCardCountProps) {
  return (
    <div className="flex gap-4 justify-around p-4">
      {counts.map((jugador) => {
        const isCurrentPlayer = jugador.jugadorId === currentJugadorId;
        
        return (
          <div
            key={jugador.jugadorId}
            className={`
              flex flex-col items-center gap-2 p-3 rounded-lg
              ${isCurrentPlayer ? 'bg-blue-100 border-2 border-blue-500' : 'bg-gray-100'}
            `}
          >
            {/* Nombre del jugador */}
            <span className="font-semibold text-sm">
              {jugador.nombre}
              {isCurrentPlayer && ' (Tú)'}
            </span>

            {/* Stack de cartas (reverso) */}
            <div className="relative w-16 h-24">
              {Array.from({ length: Math.min(jugador.count, 5) }).map((_, i) => (
                <div
                  key={i}
                  className="absolute"
                  style={{
                    left: `${i * 2}px`,
                    top: `${i * 2}px`,
                    zIndex: i,
                  }}
                >
                  <Image
                    src="/card-back.png" // Imagen del reverso de carta
                    alt="Card back"
                    width={64}
                    height={96}
                    className="rounded shadow"
                  />
                </div>
              ))}
              
              {/* Contador de cartas */}
              <div className="absolute -bottom-2 -right-2 bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold text-sm shadow-lg z-10">
                {jugador.count}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

---

## 🖱️ Componente de Drag Preview

```typescript
// components/DragPreview.tsx
'use client';

import { PlayerDragEvent } from '@/hooks/useGameWebSocket';
import { useState, useEffect } from 'react';
import Image from 'next/image';

interface DragPreviewProps {
  dragEvent: PlayerDragEvent | null;
  currentJugadorId: string;
}

export function DragPreview({ dragEvent, currentJugadorId }: DragPreviewProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (dragEvent && dragEvent.normalizedX !== undefined && dragEvent.normalizedY !== undefined) {
      setPosition({
        x: dragEvent.normalizedX * window.innerWidth,
        y: dragEvent.normalizedY * window.innerHeight,
      });
    }
  }, [dragEvent]);

  // No mostrar si no hay evento o si es el jugador actual
  if (!dragEvent || !dragEvent.dragging || dragEvent.jugadorId === currentJugadorId) {
    return null;
  }

  return (
    <div
      className="fixed pointer-events-none z-50 transition-all duration-75"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate(-50%, -50%)',
      }}
    >
      {/* Reverso de carta con indicador del jugador */}
      <div className="relative">
        <Image
          src="/card-back.png"
          alt={`${dragEvent.jugadorNombre} está moviendo una carta`}
          width={100}
          height={150}
          className="rounded shadow-2xl opacity-80"
        />
        
        {/* Label del jugador */}
        <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-black/75 text-white px-3 py-1 rounded text-xs whitespace-nowrap">
          {dragEvent.jugadorNombre}
        </div>
      </div>
    </div>
  );
}
```

---

## 📦 Ejemplo Completo

```typescript
// app/partida/[codigo]/page.tsx
'use client';

import { useState } from 'react';
import { useGameWebSocket, CardCountEvent, PlayerDragEvent } from '@/hooks/useGameWebSocket';
import { PlayerCardCount } from '@/components/PlayerCardCount';
import { DragPreview } from '@/components/DragPreview';
import { useDragAndDrop } from '@/hooks/useDragAndDrop';

interface PartidaPageProps {
  params: { codigo: string };
}

export default function PartidaPage({ params }: PartidaPageProps) {
  const [cardCounts, setCardCounts] = useState<CardCountEvent['counts']>([]);
  const [dragEvent, setDragEvent] = useState<PlayerDragEvent | null>(null);
  
  // Obtener del contexto/auth
  const jugadorId = 'current-user-id'; // Reemplazar con ID real
  
  const { isConnected, sendDragEvent } = useGameWebSocket({
    serverUrl: 'http://localhost:8080/ws',
    partidaCodigo: params.codigo,
    jugadorId,
    onCardCounts: (event) => {
      setCardCounts(event.counts);
    },
    onDragEvent: (event) => {
      setDragEvent(event);
      // Limpiar después de 500ms si dejó de arrastrar
      if (!event.dragging) {
        setTimeout(() => setDragEvent(null), 500);
      }
    },
  });

  // Hook para manejar drag de cartas locales
  const { handleDragStart, handleDrag, handleDragEnd } = useDragAndDrop({
    onDragUpdate: (data) => {
      // Throttle: enviar max cada 50ms
      sendDragEvent({
        jugadorId,
        jugadorNombre: 'Mi Nombre', // Obtener del contexto
        dragging: true,
        cardIndex: data.cardIndex,
        normalizedX: data.x / window.innerWidth,
        normalizedY: data.y / window.innerHeight,
        target: data.target,
      });
    },
    onDragEnd: () => {
      sendDragEvent({
        jugadorId,
        jugadorNombre: 'Mi Nombre',
        dragging: false,
      });
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white p-8">
      {/* Estado de conexión */}
      <div className="mb-4">
        {isConnected ? (
          <span className="text-green-400">● Conectado</span>
        ) : (
          <span className="text-red-400">● Desconectado</span>
        )}
      </div>

      {/* Contadores de cartas de todos los jugadores */}
      <PlayerCardCount counts={cardCounts} currentJugadorId={jugadorId} />

      {/* Preview de arrastre de otros jugadores */}
      <DragPreview dragEvent={dragEvent} currentJugadorId={jugadorId} />

      {/* Tus cartas (con drag) */}
      <div className="mt-8">
        <h2 className="text-xl mb-4">Tus Cartas</h2>
        <div className="flex gap-4">
          {/* Renderizar tus cartas con eventos de drag */}
        </div>
      </div>
    </div>
  );
}
```

---

## ⚡ Optimizaciones de Rendimiento

### 1. Throttling en Cliente

```typescript
// utils/throttle.ts
export function throttle<T extends (...args: any[]) => void>(
  func: T,
  limit: number
): T {
  let inThrottle: boolean;
  return function (this: any, ...args: any[]) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  } as T;
}

// Uso en drag handler
const throttledSendDrag = throttle(sendDragEvent, 50); // Max 20 eventos/s
```

### 2. Batch Updates

```typescript
// Agrupar actualizaciones de card counts
const [counts, setCounts] = useState<CardCountEvent['counts']>([]);

useEffect(() => {
  const timeout = setTimeout(() => {
    // Aplicar cambios agrupados
  }, 100);
  return () => clearTimeout(timeout);
}, [cardCounts]);
```

### 3. Memoización

```typescript
import { memo } from 'react';

export const PlayerCardCount = memo(({ counts, currentJugadorId }: Props) => {
  // ...
}, (prev, next) => {
  // Solo re-renderizar si los conteos cambiaron
  return JSON.stringify(prev.counts) === JSON.stringify(next.counts);
});
```

---

## 🔐 Consideraciones de Seguridad

1. **Validación del lado del servidor**: El backend valida que el jugador pertenece a la partida y tiene las cartas que dice tener.

2. **No revelar información privada**: Los eventos de drag NO incluyen el código de la carta, solo índices de posición.

3. **Rate limiting**: El servidor aplica throttling automático (máx 20 msg/s por jugador).

4. **Autenticación**: El jugadorId se valida contra la sesión WebSocket registrada.

---

## 📝 Notas Finales

- El backend automáticamente publica `CARD_COUNTS` cuando cambian las cartas
- El throttling en servidor evita flooding (50ms min entre eventos)
- Los eventos de drag son retransmitidos a todos los clientes de la partida
- Usa `normalizedX/Y` (0.0-1.0) para que funcione en cualquier resolución
- El `cardIndex` es opcional y solo mejora la UX (no compromete privacidad)

Para más información, consulta el código del backend en:
- `PartidaWebSocketController.java`
- `GameServiceImpl.java`
- `DragValidationServiceImpl.java`
