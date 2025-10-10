'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePartida } from '@/hooks/usePartida';

export default function JugarPage() {
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { crearPartida } = usePartida();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!nombre.trim()) return setError('Ingresa un nombre');

    try {
      const res = await crearPartida(nombre.trim());
      // navegar a la partida
      router.push(`/partida/${res.codigo}`);
    } catch (err:any) {
      setError(err.message || 'Error al crear partida');
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <h1>Crear partida</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Nombre de jugador
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <div style={{ marginTop: 12 }}>
          <button type="submit">Jugar</button>
        </div>
        {error && <p style={{ color: 'red' }}>{error}</p>}
      </form>
    </div>
  );
}
