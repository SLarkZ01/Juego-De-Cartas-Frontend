# Mostrar y actualizar atributos de cartas en Next.js (tiempo real)

Este documento explica cómo el frontend (Next.js + React) debe mostrar los atributos de las cartas (poder, defensa, ki, velocidad, etc.) y cómo mantenerlos sincronizados en tiempo real con los eventos del backend.

Contexto del proyecto
- La colección `cartas` en MongoDB contiene documentos como:

```json
{
  "_id": { "$oid": "68eb2bef5298fc57f0f0ca08" },
  "codigo": "1A",
  "nombre": "DB_1A",
  "atributos": {
    "poder": 5000,
    "defensa": 3000,
    "ki": 4500,
    "transformaciones": 1,
    "velocidad": 4000
  },
  "tematica": "dragon_ball",
  "paquete": 1,
  "_class": "com.juegocartas.juegocartas.model.Carta"
}
```

- En `partida` las manos se almacenan como códigos (ej: `"1A"`). Para renderizar una carta completa, el frontend debe mapear el código al objeto en `cartasDB` (ver `docs/NEXTJS_JUEGO_COMPLETO.md`).

Objetivos de este documento
- Mostrar cómo renderizar los atributos en el componente de carta.
- Cubrir cómo aplicar transformaciones (multiplicadores) en el cálculo del valor final.
- Explicar qué eventos WebSocket afectan los atributos mostrados y cómo actualizarlos en tiempo real.

## 1. Datos base y contrato

Usaremos este tipo TypeScript para representar una carta en el frontend:

```typescript
export type Carta = {
  codigo: string;
  nombre: string;
  imagenUrl?: string;
  atributos: Record<string, number>;
  transformaciones?: Array<{ nombre: string; multiplicador: number }>;
};
```

Estado minimal que necesitas en el `GameState`:

- `cartasDB: Record<string, Carta>` — mapa de código → carta completa
- `miJugador.cartasEnMano: string[]` — códigos de cartas
- `miJugador.transformacionActiva` e `indiceTransformacion` — si hay transformación activa para mi jugador
- `atributoSeleccionado: string | null` — atributo que se está comparando en la ronda

## 2. Componente `CartaDetalle` (render de atributos)

Ejemplo de componente que renderiza los atributos y el valor efectivo si hay transformación activa:

```tsx
// components/CartaDetalle.tsx
import React from 'react';
import { Carta } from '../utils/cartas';

interface Props {
  carta: Carta;
  atributoSeleccionado?: string | null; // ej: 'ki'
  transformacionMultiplicador?: number; // 1 = sin transformacion, 1.5 = SSJ etc.
}

export function CartaDetalle({ carta, atributoSeleccionado, transformacionMultiplicador = 1 }: Props) {
  const atributos = carta.atributos || {};

  function valorEfectivo(attr: string) {
    const base = atributos[attr] ?? 0;
    return Math.round(base * transformacionMultiplicador);
  }

  return (
    <div className="carta-detalle">
      <img src={carta.imagenUrl || '/images/placeholder-card.png'} alt={carta.nombre} />
      <h4>{carta.nombre} <small>({carta.codigo})</small></h4>

      <div className="atributos">
        {Object.keys(atributos).map((k) => (
          <div key={k} className={`atributo ${k === atributoSeleccionado ? 'seleccionado' : ''}`}>
            <span className="nombre">{k}</span>
            <span className="valor">{valorEfectivo(k)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

Notas:
- Mostrar el `valorEfectivo` permite que la UI refleje transformaciones activas sin cambiar los datos de `cartasDB`.
- Si quieres destacar el atributo seleccionado (por ejemplo durante la comparación de la ronda), pasa `atributoSeleccionado` desde el estado global.

## 3. Cómo se calculan las transformaciones

- El backend aplica transformaciones (multiplicadores) al calcular el ganador. En el frontend solo es necesario mostrar el multiplicador y aplicar el cálculo de visualización para que el jugador vea el resultado final antes de jugar.
- Representación:
  - `transformacionMultiplicador = carta.transformaciones[indice]?.multiplicador` (si el jugador la activó).

Ejemplo sencillo de cálculo en React: `const mult = miJugador.indiceTransformacion >= 0 ? carta.transformaciones?.[miJugador.indiceTransformacion]?.multiplicador ?? 1 : 1;`

## 4. Eventos que afectan atributos/valores y qué hacer al recibirlos

El backend emite eventos STOMP que el frontend debe manejar. Los más relevantes para atributos y valores mostrados son:

- `PARTIDA_INICIADA`: actualizar `cartasDB` (si no la tienes), pedir detalle privado y mapear mano.
- `ATRIBUTO_SELECCIONADO`: establecer `atributoSeleccionado` en estado global para resaltar el atributo en las cartas.
- `CARTA_JUGADA`: añadir la carta jugada a `cartasEnMesa` — la carta viene con `codigo`, `nombre`, `imagen` (el atributo concreto ya está en `cartasDB`).
- `TRANSFORMACION_ACTIVADA` / `TRANSFORMACION_DESACTIVADA`: actualizar el `miJugador.transformacionActiva` y `indiceTransformacion` para recalcular y mostrar valores efectivos.
- `RONDA_RESUELTA`: después de resolución debes refrescar la mano (GET `/api/partidas/{codigo}/detalle?jugadorId=...`) para sincronizar `cartasEnMano` y counts.

Al recibir `CARTA_JUGADA` no es necesario modificar el objeto original en `cartasDB` — simplemente usar `codigoCarta` para mostrar la carta en la mesa.

## 5. Ejemplo de hook + handlers (integración con `useGameWebSocket`)

Este fragmento muestra cómo integrar los handlers para mantener la UI sincronizada.

```ts
// hooks/useGameData.ts (simplified)
import { useState, useCallback } from 'react';
import { Carta } from '../utils/cartas';

export function useGameData() {
  const [cartasDB, setCartasDB] = useState<Record<string, Carta>>({});
  const [atributoSeleccionado, setAtributoSeleccionado] = useState<string | null>(null);
  const [miJugador, setMiJugador] = useState<any>(null);
  const [cartasEnMesa, setCartasEnMesa] = useState<any[]>([]);

  const onPartidaIniciada = useCallback(async (event) => {
    // cargar cartas si es necesario
    if (Object.keys(cartasDB).length === 0) {
      const res = await fetch('/api/cartas');
      const cartas = await res.json();
      const map = cartas.reduce((a: any, c: any) => { a[c.codigo] = c; return a; }, {});
      setCartasDB(map);
    }

    // pedir detalle privado y setear miJugador
    const detalleRes = await fetch(`/api/partidas/${event.codigo}/detalle?jugadorId=${event.miJugadorId}`);
    const detalle = await detalleRes.json();
    setMiJugador(detalle.miJugador);
  }, [cartasDB]);

  const onAtributoSeleccionado = useCallback((event) => {
    setAtributoSeleccionado(event.atributo);
  }, []);

  const onCartaJugada = useCallback((event) => {
    setCartasEnMesa((prev) => [...prev, {
      jugadorId: event.jugadorId,
      codigoCarta: event.codigoCarta,
      nombreCarta: event.nombreCarta,
      imagenCarta: event.imagenCarta,
    }] );
  }, []);

  const onTransformacion = useCallback((event) => {
    // actualizar miJugador o los jugadores públicos
    if (miJugador && event.jugadorId === miJugador.id) {
      setMiJugador((prev: any) => ({ ...prev, transformacionActiva: event.activada ? event.nombreTransformacion : null, indiceTransformacion: event.activada ? event.indice : -1 }));
    }
  }, [miJugador]);

  const onRondaResuelta = useCallback(async (event) => {
    // refrescar mano
    const detalleRes = await fetch(`/api/partidas/${event.codigo}/detalle?jugadorId=${miJugador.id}`);
    const detalle = await detalleRes.json();
    setMiJugador(detalle.miJugador);
    setCartasEnMesa([]);
    setAtributoSeleccionado(null);
  }, [miJugador]);

  return {
    cartasDB,
    miJugador,
    cartasEnMesa,
    atributoSeleccionado,
    handlers: { onPartidaIniciada, onAtributoSeleccionado, onCartaJugada, onTransformacion, onRondaResuelta }
  };
}
```

## 6. Ejemplo de flujo de renderizado en `ManoJugador`

- Para cada código en `miJugador.cartasEnMano`:
  1. Buscar `cartasDB[codigo]`.
  2. Calcular multiplicador según `miJugador.indiceTransformacion`.
  3. Pasar `transformacionMultiplicador` y `atributoSeleccionado` a `CartaDetalle`.

Esto garantiza que las cartas muestran valores exactos conforme a transformaciones y atributo seleccionado.

## 7. Edge cases y recomendaciones

- Faltan cartas en `cartasDB`: mostrar placeholder y pedir al backend `GET /api/cartas` o `expand=true`.
- Transformaciones no consistentes cliente/servidor: confía en el backend para el cálculo final de la ronda; frontend solo muestra valores estimados para UX.
- Latencia: no recalcules `cartasDB` a cada evento; mantener el mapa en memoria y sólo actualizar lo necesario (ej: counts o mano).

## 8. Resumen rápido

- Cargar `cartasDB` al inicio y cachearla.
- Renderizar atributos desde `cartasDB` y aplicar multiplicador local para transformaciones.
- Actualizar UI en respuesta a eventos WebSocket (`ATRIBUTO_SELECCIONADO`, `CARTA_JUGADA`, `TRANSFORMACION_*`, `RONDA_RESUELTA`).
- Pedir `GET /api/partidas/{codigo}/detalle?jugadorId=...` tras `RONDA_RESUELTA` para sincronizar manos.

Si quieres, puedo crear los archivos utilitarios y componentes `CartaDetalle` y `useGameData` dentro del repositorio como ejemplos listos para usar en tu Next.js (dime la ruta preferida). 
