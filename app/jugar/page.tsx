'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { usePartida } from '@/hooks/usePartida';
import { Button } from '@/components/ui/button';
import Image from 'next/image';

export default function JugarPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const { crearPartida, unirsePartida, loading } = usePartida();
  
  const [codigoPartida, setCodigoPartida] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [modo, setModo] = useState<'crear' | 'unirse'>('crear');

  // Redirigir si no está autenticado
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, authLoading, router]);

  const handleCrearPartida = async () => {
    setError(null);
    
    try {
      const response = await crearPartida();
      router.push(`/partida/${response.codigo}`);
    } catch (err: any) {
      setError(err.message || 'Error al crear partida');
    }
  };

  const handleUnirsePartida = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!codigoPartida.trim()) {
      setError('Ingresa un código de partida');
      return;
    }

    try {
      const response = await unirsePartida(codigoPartida.toUpperCase());
      router.push(`/partida/${response.codigo}`);
    } catch (err: any) {
      setError(err.message || 'Error al unirse a la partida');
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-white text-xl">Cargando...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center">
      {/* Background image */}
      <Image
        src="/images/fondo.webp"
        alt="Fondo del juego"
        fill
        className="object-cover object-center -z-10"
        priority
      />

      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/60 -z-5" />

      {/* Content */}
      <div className="relative z-10 w-full max-w-2xl mx-auto px-4">
        <div className="bg-black/80 backdrop-blur-sm p-8 rounded-lg border border-orange-500/30 shadow-2xl">
          <h1 className="text-4xl font-bold text-center mb-2 text-orange-500">
            ¡Listo para jugar, {user?.username}!
          </h1>
          <p className="text-center text-gray-300 mb-8">
            Elige cómo quieres comenzar
          </p>

          {/* Toggle de modo */}
          <div className="flex gap-4 mb-8">
            <Button
              onClick={() => setModo('crear')}
              className={`flex-1 py-6 text-lg ${
                modo === 'crear'
                  ? 'bg-orange-600 hover:bg-orange-700'
                  : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              Crear Partida
            </Button>
            <Button
              onClick={() => setModo('unirse')}
              className={`flex-1 py-6 text-lg ${
                modo === 'unirse'
                  ? 'bg-orange-600 hover:bg-orange-700'
                  : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              Unirse a Partida
            </Button>
          </div>

          {/* Contenido según el modo */}
          {modo === 'crear' ? (
            <div className="space-y-6">
              <div className="bg-gray-900/50 p-6 rounded-lg border border-gray-700">
                <h3 className="text-xl font-semibold text-white mb-3">
                  Crear Nueva Partida
                </h3>
                <p className="text-gray-400 mb-4">
                  Crea una nueva partida y comparte el código con tus amigos para que se unan.
                </p>
                <ul className="text-sm text-gray-400 space-y-2 mb-6">
                  <li>• Mínimo 2 jugadores para iniciar</li>
                  <li>• Máximo 7 jugadores</li>
                  <li>• El creador puede iniciar la partida</li>
                </ul>
              </div>

              <Button
                onClick={handleCrearPartida}
                disabled={loading}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-4 text-lg rounded-md transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
              >
                {loading ? 'Creando partida...' : '🎮 Crear Partida'}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleUnirsePartida} className="space-y-6">
              <div className="bg-gray-900/50 p-6 rounded-lg border border-gray-700">
                <h3 className="text-xl font-semibold text-white mb-3">
                  Unirse a Partida
                </h3>
                <p className="text-gray-400 mb-4">
                  Ingresa el código de la partida a la que deseas unirte.
                </p>
              </div>

              <div>
                <label htmlFor="codigo" className="block text-sm font-medium text-gray-200 mb-2">
                  Código de Partida
                </label>
                <input
                  id="codigo"
                  type="text"
                  value={codigoPartida}
                  onChange={(e) => setCodigoPartida(e.target.value.toUpperCase())}
                  required
                  maxLength={6}
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-md text-white text-center text-2xl font-mono tracking-widest placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent uppercase"
                  placeholder="ABC123"
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-4 text-lg rounded-md transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
              >
                {loading ? 'Uniéndose...' : '🚀 Unirse a Partida'}
              </Button>
            </form>
          )}

          {error && (
            <div className="mt-6 p-4 bg-red-900/50 border border-red-500 rounded-md">
              <p className="text-red-200 text-center">{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

