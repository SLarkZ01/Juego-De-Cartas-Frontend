"use client";

import React, { useEffect, useState } from 'react';
import CartaComponent from './CartaComponent';
import type { Carta } from '@/types/api';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
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
}: ManoJugadorProps) {
  const [order, setOrder] = useState<string[]>(cartasCodigos || []);

  useEffect(() => {
    setOrder(cartasCodigos || []);
  }, [cartasCodigos]);

  const sensors = useSensors(useSensor(PointerSensor));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const oldIndex = order.indexOf(active.id as string);
    const newIndex = order.indexOf(over.id as string);
    if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
      const next = arrayMove(order, oldIndex, newIndex);
      setOrder(next);
      onOrderChange?.(next);
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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={order} strategy={horizontalListSortingStrategy}>
            <div className="flex gap-3 overflow-x-auto px-2 py-3 scrollbar-hide">
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
                    <CartaComponent carta={carta || fallbackCarta} className="w-full" />
                  </SortableCard>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>

        {/* overlay: cuando hay muchas cartas se puede mostrar un botón para compactar / ver todo */}
      </div>
    </div>
  );
}

// Componente sortable que envuelve la carta
function SortableCard({ id, children, mostrarMini, onClick }: any) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`flex-shrink-0 ${mostrarMini ? 'w-24' : 'w-40'} ${isDragging ? 'scale-105 z-50' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={0}
    >
      {children}
    </div>
  );
}
