'use client';

import { useEffect, useState, useRef } from 'react';
import { crearPartida as apiCrearPartida, obtenerPartidaDetalle } from '@/lib/api';
import { conectarYSuscribir } from '@/lib/websocket';

export function usePartida() {
  const [partida, setPartida] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const clientRef = useRef<any | null>(null);

  useEffect(() => {
    return () => {
      if (clientRef.current) clientRef.current.deactivate();
    };
  }, []);

  async function crearPartida(nombreJugador: string) {
    setLoading(true);
    try {
      const res = await apiCrearPartida(nombreJugador);
      // guardar jugadorId localmente
      localStorage.setItem('jugadorId', res.jugadorId);
      // navegar a la partida se hace en el componente que llame a este hook
      return res;
    } finally {
      setLoading(false);
    }
  }

  async function cargarDetalle(codigo: string) {
    const jugadorId = localStorage.getItem('jugadorId') || '';
    if (!jugadorId) throw new Error('jugadorId no encontrado en localStorage');
    const detalle = await obtenerPartidaDetalle(codigo, jugadorId);
    setPartida(detalle);
    return detalle;
  }

  function suscribirse(codigo: string, onEvent?: (ev:any)=>void) {
    const jugadorId = localStorage.getItem('jugadorId') || '';
    if (!jugadorId) throw new Error('jugadorId no encontrado en localStorage');

    const client = conectarYSuscribir(codigo, (event:any) => {
      // actualización simple: recargar detalle en ciertos eventos
      if (event.tipo === 'RONDA_RESUELTA' || event.tipo === 'PARTIDA_INICIADA' || event.tipo === 'PARTIDA_ESTADO' || event.tipo === 'CARTA_JUGADA') {
        cargarDetalle(codigo);
      }
      if (onEvent) onEvent(event);
    });

    clientRef.current = client;
    return client;
  }

  return { partida, loading, crearPartida, cargarDetalle, suscribirse };
}
