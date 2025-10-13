"use client";

import React from 'react';
import type { Carta } from '@/types/api';

interface Props {
  carta: Carta;
  atributoSeleccionado?: string | null;
  transformacionMultiplicador?: number; // 1 = sin transformacion
}

export default function CartaDetalle({ carta, atributoSeleccionado = null, transformacionMultiplicador = 1 }: Props) {
  const atributos = carta.atributos || {};

  function valorEfectivo(attr: string) {
    const base = atributos[attr] ?? 0;
    return Math.round(base * transformacionMultiplicador);
  }

  // Mantener un orden predecible de atributos: usar las claves conocidas del backend
  const ordenAtributos = ['poder', 'defensa', 'ki', 'velocidad'];
  const keys = Array.from(new Set([...ordenAtributos, ...Object.keys(atributos)]));

  return (
    <div className="w-full">
      <div className="flex flex-col gap-1 text-white text-sm">
        {keys.map((k) => (
          <div key={k} className={`flex items-center justify-between px-2 py-1 rounded ${k === atributoSeleccionado ? 'bg-white/10 font-bold' : ''}`}>
            <span className="capitalize text-xs text-gray-200">{k}</span>
            <span className="text-sm font-mono">{valorEfectivo(k)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
