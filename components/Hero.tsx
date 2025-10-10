import Image from "next/image";
import Link from "next/link";
import { Button } from "../components/ui/button";

export default function Hero() {
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

        <Button variant="dragon" asChild>
          <Link href="/play" className="px-12 py-6 text-lg si">
            Jugar
          </Link>
        </Button>
      </div>
    </section>
  );
}
