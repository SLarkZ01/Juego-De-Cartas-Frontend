'use client';

import Image from 'next/image';
import type { Carta } from '@/types/api';

interface CartaComponentProps {
  carta: Carta;
  mostrarAtributos?: boolean;
  atributoSeleccionado?: string;
  className?: string;
}

export default function CartaComponent({ 
  carta, 
  mostrarAtributos = true,
  atributoSeleccionado,
  className = '' 
}: CartaComponentProps) {
  return (
    <div className={`relative bg-gradient-to-br from-gray-900 to-black rounded-lg border-2 border-orange-500/30 overflow-hidden shadow-xl hover:shadow-2xl transition-all ${className}`}>
      {/* Imagen de la carta */}
      <div className="relative aspect-[2/3] w-full">
        {carta.imagenUrl ? (
          <Image
            src={carta.imagenUrl}
            alt={carta.nombre}
            fill
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
            <span className="text-6xl">❓</span>
          </div>
        )}
        
        {/* Overlay con el nombre */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4">
          <h3 className="text-white font-bold text-lg truncate">{carta.nombre}</h3>
          {carta.raza && (
            <p className="text-orange-400 text-sm">{carta.raza}</p>
          )}
        </div>
      </div>

      {/* Atributos */}
      {mostrarAtributos && carta.atributos && (
        <div className="p-3 bg-black/50 space-y-1">
          {Object.entries(carta.atributos).map(([key, value]) => (
            <div 
              key={key}
              className={`flex justify-between items-center px-2 py-1 rounded ${
                atributoSeleccionado === key 
                  ? 'bg-orange-600/30 border border-orange-500' 
                  : 'bg-gray-800/50'
              }`}
            >
              <span className="text-gray-300 text-sm capitalize">{key}</span>
              <span className={`font-bold ${
                atributoSeleccionado === key ? 'text-orange-400' : 'text-white'
              }`}>
                {value}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Transformaciones disponibles */}
      {carta.transformaciones && carta.transformaciones.length > 0 && (
        <div className="absolute top-2 right-2 bg-yellow-500/90 text-black px-2 py-1 rounded-full text-xs font-bold">
          ⚡ {carta.transformaciones.length}
        </div>
      )}
    </div>
  );
}
