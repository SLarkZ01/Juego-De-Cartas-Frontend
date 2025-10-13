"use client";

import React from 'react';
import { useDroppable } from '@dnd-kit/core';

type Props = {
  className?: string;
};

export default function Mesa({ className = '' }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: 'mesa' });
  // Intentar cargar imagen desde public; si no existe, usar un fallback de color
  const bgStyle: React.CSSProperties = { backgroundImage: "url('/mesa.webp')" };

  return (
    <div ref={setNodeRef} className={`relative rounded-lg overflow-hidden ${className}`}>
      <div className={`w-full h-72 bg-center bg-cover border border-gray-800 rounded-lg ${isOver ? 'ring-4 ring-orange-400/40' : ''}`} style={bgStyle}>
        <div className="w-full h-full flex items-center justify-center">
          <div className="text-gray-200/80">Aquí se desplegarán las cartas jugadas</div>
        </div>
      </div>
    </div>
  );
}
