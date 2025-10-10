'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { usePartida } from '@/hooks/usePartida';

export default function PartidaPage() {
  const params = useParams();
  const codigo = params?.codigo as string;
  const { partida, cargarDetalle, suscribirse } = usePartida();
  const [eventos, setEventos] = useState<any[]>([]);
  const router = useRouter();

  useEffect(() => {
    if (!codigo) return;
    cargarDetalle(codigo).catch((e)=>{
      console.error(e);
    });

    const client = suscribirse(codigo, (ev:any) => {
      setEventos(prev => [ev, ...prev].slice(0,50));
    });

    return () => {
      if (client) client.deactivate();
    };
  }, [codigo]);

  if (!codigo) return <p>Código no válido</p>;

  return (
    <div style={{ padding: 24 }}>
      <h1>Partida {codigo}</h1>
      <p>Estado: {partida?.estado}</p>
      <p>Turno actual: {partida?.turnoActual}</p>

      <h2>Eventos recientes</h2>
      <ul>
        {eventos.map((ev, i) => (
          <li key={i}>{ev.tipo} - {ev.timestamp || ''}</li>
        ))}
      </ul>
    </div>
  );
}
