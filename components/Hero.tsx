'use client';

import Image from "next/image";
import Link from "next/link";
import { Button } from "./ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";

export default function Hero() {
  const { isAuthenticated, user, logout, loading } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  const handleJugar = () => {
    router.push('/jugar');
  };

  return (
    <section className="relative w-full min-h-[60vh] flex items-center justify-center">
      <div className="z-10 flex flex-col items-center justify-center gap-8 px-6 py-16">
        <div className="flex items-center justify-center">
          <Image
            src="/images/logo_dragonballsuper.webp"
            alt="Dragon Ball logo"
            width={550}
            height={550}
            className="object-contain"
            priority
          />
        </div>

        {loading ? (
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
            <span className="text-white">Cargando...</span>
          </div>
        ) : isAuthenticated ? (
          <div className="flex flex-col items-center gap-6">
            <div className="bg-black/60 backdrop-blur-sm rounded-lg px-8 py-4 border border-orange-500/30">
              <p className="text-white text-xl text-center">
                ¡Bienvenido, <span className="text-orange-500 font-bold">{user?.username}</span>!
              </p>
            </div>
            <div className="flex gap-4 flex-wrap justify-center">
              <Button 
                variant="dragon" 
                onClick={handleJugar}
                className="px-12 py-6 text-lg shadow-lg hover:shadow-orange-500/50 transition-all"
              >
                🎮 ¡A jugar!
              </Button>
              <Button 
                variant="outline" 
                onClick={handleLogout}
                className="px-8 py-6 text-lg border-2 border-gray-600 text-white hover:bg-red-900/30 hover:border-red-500 transition-all"
              >
                🚪 Cerrar Sesión
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-4 flex-wrap justify-center">
            <Button variant="dragon" asChild className="shadow-lg hover:shadow-orange-500/50 transition-all">
              <Link href="/login" className="px-12 py-6 text-lg">
                🔐 Iniciar Sesión
              </Link>
            </Button>
            <Button 
              variant="outline" 
              asChild 
              className="border-2 border-orange-500 text-orange-500 hover:bg-orange-500/20 hover:border-orange-400 transition-all"
            >
              <Link href="/register" className="px-12 py-6 text-lg">
                ✨ Registrarse
              </Link>
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

