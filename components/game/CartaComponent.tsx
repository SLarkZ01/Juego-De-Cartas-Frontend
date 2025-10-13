'use client';

import Image from 'next/image';
import type { Carta } from '@/types/api';

interface CartaComponentProps {
  carta: Carta;
  mostrarAtributos?: boolean;
  className?: string;
}

export default function CartaComponent({ 
  carta, 
  mostrarAtributos = true,
  className = '' 
}: CartaComponentProps) {
  // Posiciones aproximadas para los 4 atributos en la plantilla `public/CartaNormal.webp`.
  // Se usan clases absolute con porcentajes para facilitar ajustes responsivos.
  // ROJO: fuerza, AZUL: defensa, VERDE: ki, AMARILLO: velocidad

  // Backend uses Spanish keys: poder, defensa, ki, velocidad, transformaciones
  // We support fallbacks from possible other keys used previously (fuerza/strength, defense, energy, speed)
  const fuerza = carta.atributos?.poder ?? carta.atributos?.fuerza ?? carta.atributos?.strength ?? 0;
  const defensa = carta.atributos?.defensa ?? carta.atributos?.defense ?? 0;
  const ki = carta.atributos?.ki ?? carta.atributos?.energy ?? 0;
  const velocidad = carta.atributos?.velocidad ?? carta.atributos?.speed ?? 0;
  // transformaciones puede venir como número dentro de atributos o como un array en carta.transformaciones
  const transformacionesCount = carta.atributos?.transformaciones ?? (Array.isArray(carta.transformaciones) ? carta.transformaciones.length : 0);

  return (
    <div className={`relative w-full max-w-[220px] ${className}`}>
      {/* Contenedor con aspecto de carta 2:3 */}
      <div className="relative aspect-[2/3] w-full rounded-lg overflow-hidden drop-shadow-lg">
        {/* Plantilla de carta (fondo con casillas de atributos) */}
        <Image
          src="/CartaNormal.webp"
          alt="Plantilla carta"
          fill
          className="object-cover"
          priority={false}
        />

        {/* Badge pequeño arriba-izquierda con el código/numero de carta (no tapa el diseño) */}
        {carta.codigo && (
          <div className="absolute top-2 left-2 z-20 pointer-events-none">
            <div className="bg-black/60 text-white text-xs font-bold px-2 py-1 rounded-md backdrop-blur-sm">{carta.codigo}</div>
          </div>
        )}

        {/* Imagen del artwork de la carta (centrado dentro del círculo de la plantilla) */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {carta.imagenUrl ? (
            <Image
              src={carta.imagenUrl}
              alt={carta.nombre}
              width={140}
              height={140}
              className="object-contain rounded-full"
            />
          ) : (
            <div className="w-32 h-32 rounded-full bg-gray-800 flex items-center justify-center text-3xl text-white">?</div>
          )}
        </div>

        {/* Nombre y subtítulo abajo */}
        <div className="absolute left-4 right-4 bottom-20 text-center pointer-events-none">
          <h3 className="text-white font-bold text-sm truncate">{carta.nombre}</h3>
          {carta.raza && <p className="text-yellow-200 text-xs">{carta.raza}</p>}
        </div>

        {/* Atributos posicionados: ajusta porcentajes según la plantilla */}
        {mostrarAtributos && (
          <div className="absolute left-4 right-4 bottom-4 pointer-events-none">
            <div className="mx-auto max-w-[160px]">
              {/* Render simple de valores: si no hay atributos aún, mostramos skeletons */}
              <div className="grid grid-cols-4 gap-2">
                <div className="bg-red-600/90 text-white rounded text-xs font-bold text-center py-1">
                  {typeof carta.atributos === 'object' && carta.atributos && Object.keys(carta.atributos).length > 0 ? (
                    fuerza
                  ) : (
                    <div className="h-4 w-full bg-red-700/60 rounded animate-pulse mx-auto" />
                  )}
                </div>
                <div className="bg-blue-600/90 text-white rounded text-xs font-bold text-center py-1">
                  {typeof carta.atributos === 'object' && carta.atributos && Object.keys(carta.atributos).length > 0 ? (
                    defensa
                  ) : (
                    <div className="h-4 w-full bg-blue-700/60 rounded animate-pulse mx-auto" />
                  )}
                </div>
                <div className="bg-emerald-600/90 text-white rounded text-xs font-bold text-center py-1">
                  {typeof carta.atributos === 'object' && carta.atributos && Object.keys(carta.atributos).length > 0 ? (
                    ki
                  ) : (
                    <div className="h-4 w-full bg-emerald-700/60 rounded animate-pulse mx-auto" />
                  )}
                </div>
                <div className="bg-yellow-400/95 text-black rounded text-xs font-bold text-center py-1">
                  {typeof carta.atributos === 'object' && carta.atributos && Object.keys(carta.atributos).length > 0 ? (
                    velocidad
                  ) : (
                    <div className="h-4 w-full bg-yellow-300/60 rounded animate-pulse mx-auto" />
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Indicador de transformaciones (usa atributos.transformaciones si está presente) */}
        {transformacionesCount > 0 && (
          <div className="absolute top-3 right-3 bg-yellow-300/95 text-black px-2 py-0.5 rounded-full text-xs font-bold">
            ⚡ {transformacionesCount}
          </div>
        )}
      </div>
    </div>
  );
}
