import Image from 'next/image';
import LoginForm from '@/components/auth/LoginForm';

export default function LoginPage() {
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
      <div className="relative z-10 w-full px-4">
        <LoginForm />
      </div>
    </div>
  );
}
