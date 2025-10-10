import Image from "next/image";
import Hero from "../components/Hero";
import Footer from "../components/Footer";

export default function Home() {
  return (
    <div className="relative min-h-screen flex flex-col">
      {/* Background image */}
      <Image
        src="/images/fondo.webp"
        alt="Fondo del juego"
        fill
        className="object-cover object-center -z-10"
        priority
      />

      {/* Subtle top-to-bottom gradient overlay (slightly darken at top) */}
      <div className="pointer-events-none absolute inset-0 -z-5 bg-gradient-to-b from-black/25 via-transparent to-transparent" />

      <main className="flex-1 flex items-center justify-center">
        <div className="w-full">
          <Hero />
        </div>
      </main>

      <Footer />
    </div>
  );
}
