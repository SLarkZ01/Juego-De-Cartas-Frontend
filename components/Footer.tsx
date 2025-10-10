import Image from "next/image";

export default function Footer() {
  return (
    <footer className="w-full border-t border-border bg-background/60">
      <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-5">
          <Image
            src="/logo_dragonballapi.webp"
            alt="Dragon Ball API"
            width={110}
            height={110}
          />
          <div className="text-sm">
            <div className="font-medium">Dragon Ball API</div>
            <div className="text-muted-foreground">Datos provistos por la API pública</div>
          </div>
        </div>

        <div className="text-sm text-center text-muted-foreground">
          © {new Date().getFullYear()} Daniel Rivas Agredo & Thomas Montoya Magon. Todos los
          derechos reservados.
        </div>

        <div className="flex gap-4 items-center">
          <a
            href="https://web.dragonball-api.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm hover:underline"
          >
            API
          </a>
        </div>
      </div>
    </footer>
  );
}
