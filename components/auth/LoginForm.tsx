/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function LoginForm() {
  const router = useRouter();
  const { login } = useAuth();
  
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(formData);
      // Tras login exitoso, intentar reconexión automática a una partida en espera
      try {
        const mod = await import('@/hooks/useAutoReconnectAfterLogin');
        const tryAutoReconnectAfterLogin = mod.tryAutoReconnectAfterLogin;
        const reconnected = await tryAutoReconnectAfterLogin(router as any);
        if (reconnected) return; // la función ya redirigió a la partida
      } catch (e) {
        // Si falla el intento de reconexión automática, continuar al lobby
        console.warn('[LoginForm] tryAutoReconnectAfterLogin falló o no disponible:', e);
      }

      // Redirigir al listado por defecto
      router.push('/jugar');
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-black/80 backdrop-blur-sm p-8 rounded-lg border border-orange-500/30 shadow-2xl">
        <h1 className="text-3xl font-bold text-center mb-6 text-orange-500">
          Iniciar Sesión
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-200 mb-2">
              Usuario o Email
            </label>
            <input
              id="username"
              name="username"
              type="text"
              value={formData.username}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              placeholder="Ingresa tu usuario o email"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-200 mb-2">
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
              required
              minLength={6}
              className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              placeholder="Ingresa tu contraseña"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-900/50 border border-red-500 rounded-md">
              <p className="text-red-200 text-sm">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2 px-4 rounded-md transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
          >
            {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-gray-400">
            ¿No tienes cuenta?{' '}
            <Link href="/register" className="text-orange-500 hover:text-orange-400 font-semibold">
              Regístrate
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
