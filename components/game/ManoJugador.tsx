"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useEffect, useState } from 'react';
import CartaComponent from './CartaComponent';
import type { Carta } from '@/types/api';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface ManoJugadorProps {
  cartasCodigos: string[]; // lista de códigos que pertenecen al jugador
  cartasDB: Record<string, Carta>;
  onJugarCarta?: (codigo: string) => void;
  mostrarMini?: boolean; // vista compacta cuando hay muchas cartas
  className?: string;
  onOrderChange?: (newOrder: string[]) => void; // opcional: notifica reordenación
  controlledOrder?: string[]; // si se pasa, ManoJugador se convierte en controlada
  externalDnd?: boolean; // si true, DndContext lo crea el padre
  onDropToMesa?: (codigo: string) => void; // callback cuando se suelta sobre la mesa
  // forwarded props to allow attribute clicks from parent
  onSelectAtributo?: (atributo: 'poder' | 'defensa' | 'ki' | 'velocidad', cartaCodigo?: string) => void;
  canSelectAtributo?: boolean;
}

/**
 * ManoJugador
 * - Muestra las cartas de un jugador en una fila horizontal.
 * - Soporta drag-and-drop usando react-beautiful-dnd.
 * - Si `mostrarMini` está activado se muestran cartas más pequeñas.
 */
export default function ManoJugador({
  cartasCodigos,
  cartasDB,
  onJugarCarta,
  mostrarMini = false,
  className = '',
  onOrderChange,
  controlledOrder,
  externalDnd = false,
  onDropToMesa,
  onSelectAtributo,
  canSelectAtributo,
}: ManoJugadorProps) {
  const [order, setOrder] = useState<string[]>(controlledOrder ?? cartasCodigos ?? []);

  useEffect(() => {
    if (controlledOrder) {
      setOrder(controlledOrder);
    } else {
      setOrder(cartasCodigos || []);
    }
  }, [cartasCodigos, controlledOrder]);

  // Always call hooks in the same order. Use internalSensors when this component creates its own DndContext.
  const internalPointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 6 } });
  const internalTouchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } });
  const internalSensors = useSensors(internalPointerSensor, internalTouchSensor);

  const handleInternalDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    // drop sobre la mesa -> delegado a onDropToMesa si existe
    if (over.id === 'mesa') {
      onDropToMesa?.(active.id as string);
      return;
    }
    const oldIndex = order.indexOf(active.id as string);
    const newIndex = order.indexOf(over.id as string);
    if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
      const next = arrayMove(order, oldIndex, newIndex);
      if (controlledOrder) {
        onOrderChange?.(next);
      } else {
        setOrder(next);
        onOrderChange?.(next);
      }
    }
  };

  // Si no hay cartas, mostrar placeholder
  if (!order || order.length === 0) {
    return (
      <div className={`p-4 rounded bg-black/40 text-center text-sm text-gray-300 ${className}`}>
        No tienes cartas
      </div>
    );
  }

  return (
    <div className={`mano-jugador ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-gray-200">Mi Mazo ({order.length})</div>
      </div>

      <div className="relative">
        {externalDnd ? (
          // El padre provee DndContext y onDragEnd; aquí solo renderizamos SortableContext
          <SortableContext items={order} strategy={horizontalListSortingStrategy}>
            <div className="flex gap-3 overflow-x-auto px-2 py-3 scrollbar-hide" style={{ touchAction: 'none' }}>
              {order.map((codigo) => {
                const carta = cartasDB[codigo];
                const fallbackCarta = {
                  codigo,
                  nombre: codigo,
                  imagenUrl: undefined,
                  atributos: {},
                } as any;

                  return (
                    <SortableCard
                      key={codigo}
                      id={codigo}
                      mostrarMini={mostrarMini}
                      onClick={() => onJugarCarta?.(codigo)}
                    >
                      <CartaComponent
                        carta={carta || fallbackCarta}
                        className="w-full"
                        onSelectAtributo={onSelectAtributo}
                        canSelect={!!onSelectAtributo && !!canSelectAtributo}
                      />
                    </SortableCard>
                  );
              })}
            </div>
          </SortableContext>
        ) : (
          <DndContext sensors={internalSensors} modifiers={[restrictToWindowEdges]} collisionDetection={closestCenter} onDragEnd={handleInternalDragEnd}>
            <SortableContext items={order} strategy={horizontalListSortingStrategy}>
              <div className="flex gap-3 overflow-x-auto px-2 py-3 scrollbar-hide" style={{ touchAction: 'none' }}>
                {order.map((codigo) => {
                  const carta = cartasDB[codigo];
                  const fallbackCarta = {
                    codigo,
                    nombre: codigo,
                    imagenUrl: undefined,
                    atributos: {},
                  } as any;

                  return (
                    <SortableCard
                      key={codigo}
                      id={codigo}
                      mostrarMini={mostrarMini}
                      onClick={() => onJugarCarta?.(codigo)}
                    >
                      <CartaComponent
                        carta={carta || fallbackCarta}
                        className="w-full"
                        onSelectAtributo={onSelectAtributo}
                        canSelect={!!onSelectAtributo && !!canSelectAtributo}
                      />
                    </SortableCard>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {/* overlay: cuando hay muchas cartas se puede mostrar un botón para compactar / ver todo */}
      </div>
    </div>
  );
}

// Componente sortable que envuelve la carta
function SortableCard({ id, children, mostrarMini, onClick }: any) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  // When dragging, avoid applying the sortable transform to the original node to prevent
  // visual duplication/flicker with a separate portal overlay. Keep opacity:0 so the
  // original element stays in layout for sizing, but don't move it via transform.
  const appliedTransform = isDragging ? undefined : CSS.Transform.toString(transform);
  const style = {
    transform: appliedTransform,
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      data-draggable-id={id}
      {...attributes}
      {...listeners}
      className={`flex-shrink-0 ${mostrarMini ? 'w-24' : 'w-40'} ${isDragging ? 'scale-105 z-50' : ''}`}
      // use opacity instead of visibility to keep the element's bounding rect stable for overlay sizing
  // avoid aria-hidden on focused elements (accessibility): use inert or opacity for visual hiding
  aria-hidden={false}
      style={{
        ...style,
        opacity: isDragging ? 0 : undefined,
        pointerEvents: isDragging ? 'none' : undefined,
        // ensure element keeps its width/height so getBoundingClientRect returns meaningful values
        minWidth: mostrarMini ? 96 : 160,
      }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={0}
    >
      {children}
    </div>
  );
}
