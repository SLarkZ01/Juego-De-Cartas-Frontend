'use client';

import Image from 'next/image';
import type { Carta } from '@/types/api';

interface CartaComponentProps {
  carta: Carta;
  mostrarAtributos?: boolean;
  className?: string;
  // called when the player selects an attribute by clicking the number
  onSelectAtributo?: (atributo: 'poder' | 'defensa' | 'ki' | 'velocidad', cartaCodigo?: string) => void;
  // whether clicking to select is currently allowed (visual/guard)
  canSelect?: boolean;
  // name of atributo currently selected (local optimistic or server-confirmed)
  selectedAtributo?: string | null;
  // code of the card for which atributo was selected
  selectedCartaCodigo?: string | null;
}

export default function CartaComponent({ 
  carta, 
  mostrarAtributos = true,
  className = '' 
  , onSelectAtributo, canSelect = false, selectedAtributo = null, selectedCartaCodigo = null
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
          className="object-cover z-20"
          priority={false}
        />

        {/* Badge pequeño arriba-izquierda con el código/numero de carta (no tapa el diseño) */}
        {carta.codigo && (
          <div className="absolute top-2 left-2 z-40 pointer-events-none">
            <div className="bg-black/60 text-white text-xs font-bold px-2 py-1 rounded-md backdrop-blur-sm">{carta.codigo}</div>
          </div>
        )}

        {/* Nombre y subtítulo (posicionado en la franja superior bajo el logo) */}
        <div className="absolute left-4 right-4 top-10 text-center pointer-events-none z-30">
          <h3 className="text-black font-bold text-sm leading-tight truncate">{carta.nombre}</h3>
          {carta.raza && <p className="text-yellow-200 text-xs">{carta.raza}</p>}
        </div>

        {/* Artwork dentro del círculo de la plantilla: posicionamos un contenedor absoluto con tamaño relativo */}
        <div className="absolute left-1/2 top-[28%] -translate-x-1/2 w-[44%] aspect-square rounded-full overflow-hidden pointer-events-none z-0">
          {carta.imagenUrl ? (
            <Image
              src={carta.imagenUrl}
              alt={carta.nombre}
              fill
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gray-800 flex items-center justify-center text-2xl text-white">?</div>
          )}
        </div>

        {/* Atributos posicionados: colocamos cada valor en coordenadas absolutas bajo su logo en la plantilla.
            Usamos porcentajes para que escale con el tamaño de la carta. */}
        {mostrarAtributos && (
          <>
            {/* Contenedor relativo para las posiciones absolutas */}
            <div className="absolute inset-0 z-30">
              {/* ROJO - fuerza */}
                   <div className="absolute left-[20%] top-[69.2%] -translate-x-1/2 w-5 text-center">
                     {typeof carta.atributos === 'object' && carta.atributos && Object.keys(carta.atributos).length > 0 ? (
                       <div
                         role={onSelectAtributo && canSelect ? 'button' : undefined}
                         tabIndex={onSelectAtributo && canSelect ? 0 : -1}
                         onClick={() => { if (onSelectAtributo && canSelect) onSelectAtributo('poder', carta.codigo); }}
                         onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && onSelectAtributo && canSelect) { e.preventDefault(); onSelectAtributo('poder', carta.codigo); } }}
                         className={`${canSelect ? 'cursor-pointer' : ''} text-white text-[8px] font-medium leading-none ${selectedAtributo === 'poder' && selectedCartaCodigo === carta.codigo ? 'animate-pulse drop-shadow-[0_0_6px_rgba(255,255,255,0.9)]' : ''}`}
                       >{fuerza}</div>
                     ) : (
                       <div className="h-1.5 w-5 mx-auto" />
                     )}
                   </div>

              {/* AZUL - defensa */}
                   <div className="absolute left-[39%] top-[69.2%] -translate-x-1/2 w-5 text-center">
                     {typeof carta.atributos === 'object' && carta.atributos && Object.keys(carta.atributos).length > 0 ? (
                       <div
                         role={onSelectAtributo && canSelect ? 'button' : undefined}
                         tabIndex={onSelectAtributo && canSelect ? 0 : -1}
                         onClick={() => { if (onSelectAtributo && canSelect) onSelectAtributo('defensa', carta.codigo); }}
                         onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && onSelectAtributo && canSelect) { e.preventDefault(); onSelectAtributo('defensa', carta.codigo); } }}
                         className={`${canSelect ? 'cursor-pointer' : ''} text-white text-[8px] font-medium leading-none ${selectedAtributo === 'defensa' && selectedCartaCodigo === carta.codigo ? 'animate-pulse drop-shadow-[0_0_6px_rgba(255,255,255,0.9)]' : ''}`}
                       >{defensa}</div>
                     ) : (
                       <div className="h-1.5 w-5 mx-auto" />
                     )}
                   </div>

              {/* VERDE - ki */}
                   <div className="absolute left-[58%] top-[69.2%] -translate-x-1/2 w-5 text-center">
                     {typeof carta.atributos === 'object' && carta.atributos && Object.keys(carta.atributos).length > 0 ? (
                       <div
                         role={onSelectAtributo && canSelect ? 'button' : undefined}
                         tabIndex={onSelectAtributo && canSelect ? 0 : -1}
                         onClick={() => { if (onSelectAtributo && canSelect) onSelectAtributo('ki', carta.codigo); }}
                         onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && onSelectAtributo && canSelect) { e.preventDefault(); onSelectAtributo('ki', carta.codigo); } }}
                         className={`${canSelect ? 'cursor-pointer' : ''} text-white text-[8px] font-medium leading-none ${selectedAtributo === 'ki' && selectedCartaCodigo === carta.codigo ? 'animate-pulse drop-shadow-[0_0_6px_rgba(255,255,255,0.9)]' : ''}`}
                       >{ki}</div>
                     ) : (
                       <div className="h-1.5 w-5 mx-auto" />
                     )}
                   </div>

              {/* AMARILLO - velocidad */}
                   <div className="absolute left-[78%] top-[69.2%] -translate-x-1/2 w-5 text-center">
                     {typeof carta.atributos === 'object' && carta.atributos && Object.keys(carta.atributos).length > 0 ? (
                       <div
                         role={onSelectAtributo && canSelect ? 'button' : undefined}
                         tabIndex={onSelectAtributo && canSelect ? 0 : -1}
                         onClick={() => { if (onSelectAtributo && canSelect) onSelectAtributo('velocidad', carta.codigo); }}
                         onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && onSelectAtributo && canSelect) { e.preventDefault(); onSelectAtributo('velocidad', carta.codigo); } }}
                         className={`${canSelect ? 'cursor-pointer' : ''} text-black text-[8px] font-medium leading-none ${selectedAtributo === 'velocidad' && selectedCartaCodigo === carta.codigo ? 'animate-pulse drop-shadow-[0_0_6px_rgba(0,0,0,0.9)]' : ''}`}
                       >{velocidad}</div>
                     ) : (
                       <div className="h-1.5 w-5 mx-auto" />
                     )}
                   </div>
            </div>
          </>
        )}

        {/* Indicador de transformaciones (usa atributos.transformaciones si está presente) */}
        {transformacionesCount > 0 && (
          <div className="absolute top-3 right-3 bg-yellow-300/95 text-black px-2 py-0.5 rounded-full text-xs font-bold z-40">
            ⚡ {transformacionesCount}
          </div>
        )}
      </div>
    </div>
  );
}
