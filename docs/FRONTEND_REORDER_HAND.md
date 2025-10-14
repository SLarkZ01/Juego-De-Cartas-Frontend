## Frontend — Persistir el orden de la mano (reorder) en el backend

Este documento explica cómo implementar en el frontend (Next.js + React + TypeScript) la persistencia del orden de la mano del jugador usando el endpoint REST `POST /api/partidas/{codigo}/mano/reorder` que el backend expone.

Objetivos:
- Permitir al jugador reordenar visualmente su mano.
- Enviar el nuevo orden al backend una vez que el jugador finaliza la reordenación (drag end).
- Usar optimist UI para una experiencia fluida, pero confirmar con el servidor y reconciliar o revertir en caso de fallo.

Principios y recomendaciones:
- Enviar la solicitud en dragEnd (no constantemente durante el drag) para reducir carga y evitar flujos de conflictos.
- Mostrar feedback visual (loader o estado "guardando orden") mientras se persiste.
- Esperar la respuesta del servidor (o la publicación `PartidaResponse` en WS) para confirmar el nuevo orden.
- En caso de error: revertir la UI al orden anterior y mostrar un mensaje claro (toast/modal). Agregar opción de reintento.

Contrato del endpoint (recordatorio):
- POST /api/partidas/{codigo}/mano/reorder
- Body: { "order": ["4A", "3C", ...] }
- Requisito: usuario autenticado; el servidor identifica `jugadorId` desde el SecurityContext.

Ejemplo completo (React + TypeScript)

Archivo: `hooks/useReorderHand.ts`

```ts
import { useState, useCallback, useRef } from 'react';
import axios from 'axios';

type UseReorderProps = {
  partidaCodigo: string;
  initialHand: string[]; // lista de códigos de carta
  onPartidaResponse?: (resp: any) => void; // opcional callback al recibir la respuesta del servidor
};

export function useReorderHand({ partidaCodigo, initialHand, onPartidaResponse }: UseReorderProps) {
  const [hand, setHand] = useState<string[]>(initialHand);
  const [saving, setSaving] = useState(false);
  const prevRef = useRef<string[] | null>(null);

  // Optimistic reorder: aplica el nuevo orden localmente y devuelve una función para confirmar (llamar en dragEnd)
  const applyLocalReorder = useCallback((newOrder: string[]) => {
    prevRef.current = hand.slice();
    setHand(newOrder);
  }, [hand]);

  // Confirmar (enviar al backend). Retorna la promesa de la llamada.
  const confirmReorder = useCallback(async (newOrder: string[]) => {
    setSaving(true);
    try {
      const resp = await axios.post(`/api/partidas/${partidaCodigo}/mano/reorder`, { order: newOrder });
      // Opcional: el servidor publica el PartidaResponse en WS; igualmente reconciliamos con la respuesta REST
      if (onPartidaResponse) onPartidaResponse(resp.data);
      prevRef.current = null;
      return resp.data;
    } catch (err: any) {
      // Rollback
      if (prevRef.current) setHand(prevRef.current);
      prevRef.current = null;
      // Mostrar error: el caller puede rethrow o mostrar toast global
      throw err;
    } finally {
      setSaving(false);
    }
  }, [partidaCodigo, onPartidaResponse]);

  const rollback = useCallback(() => {
    if (prevRef.current) {
      setHand(prevRef.current);
      prevRef.current = null;
    }
  }, []);

  return { hand, setHand, applyLocalReorder, confirmReorder, rollback, saving };
}
```

Uso en componente con react-beautiful-dnd (ejemplo simplificado)

```tsx
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';
import { useReorderHand } from '../hooks/useReorderHand';

function Mano({ partidaCodigo, initialHand }) {
  const { hand, applyLocalReorder, confirmReorder, saving } = useReorderHand({ partidaCodigo, initialHand });

  function onDragEnd(result: DropResult) {
    if (!result.destination) return;
    const newOrder = Array.from(hand);
    const [moved] = newOrder.splice(result.source.index, 1);
    newOrder.splice(result.destination.index, 0, moved);

    // Aplicamos optimist UI
    applyLocalReorder(newOrder);

    // Confirmar al terminar el drag (no throttle necesario aquí, porque es dragEnd)
    confirmReorder(newOrder).catch(err => {
      // Mostrar notificación
      console.error('Error al guardar orden:', err?.response?.data || err.message || err);
      // Opcional: mostrar toast
      window.alert('No se pudo guardar el orden. Se ha revertido.');
    });
  }

  return (
    <div>
      {saving && <div className="saving-indicator">Guardando orden...</div>}
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="hand" direction="horizontal">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="hand-row">
              {hand.map((code, idx) => (
                <Draggable draggableId={code} index={idx} key={code}>
                  {(prov) => (
                    <div ref={prov.innerRef} {...prov.draggableProps} {...prov.dragHandleProps} className="card-slot">
                      <Card code={code} />
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
}
```

Mejoras y robustecimiento
- Reintentos: en caso de fallo temporal, ofrecer reintento con backoff exponencial.
- Throttling: si implementas reorder por eventos continuos (no recomendado), aplicar throttle (p.ej. 1 request por segundo). Pero con dragEnd no hace falta.
- Reconciliación WS: preferir la actualización que provenga del WS (`PartidaResponse`) como fuente de verdad (si llega) y sincronizar la UI con ella; la respuesta REST es útil para confirmación inmediata.
- Manejo de conflictos: si varios clientes controlan la misma cuenta, la última modificación aceptada por el servidor será la fuente de verdad; el otro cliente recibirá `PartidaResponse` con la nueva mano y deberá reconciliar.

Testing manual recomendado
- Probar reorder válido: reordena y confirma, verifica que la publicación en `/topic/partida/{codigo}` contiene la nueva mano.
- Probar mismatch: modifica la petición para enviar una lista distinta (p.ej. quitar un código) y verificar que el servidor devuelve 400 y que la UI revierte.

Conclusión
- Enviar la solicitud al terminar la reordenación (dragEnd) combinado con optimist UI y rollback en error brinda la mejor UX con mínima carga al servidor.
