import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Pwa } from "@/components/pwa";
import { WebVitals } from "@/components/web-vitals";
import { SITE_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  // Base das URLs absolutas dos cards de compartilhamento (opengraph-image)
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  // A aba mostra sempre só o nome do site. O título de cada página vai para o
  // compartilhamento (openGraph), definido nas páginas que valem a pena compartilhar.
  title: { default: SITE_NAME, template: SITE_NAME },
  description: "Registre, avalie e compartilhe seus jogos, platinas e reviews.",
  openGraph: { siteName: SITE_NAME, locale: "pt_BR", type: "website" },
  applicationName: SITE_NAME,
  appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: "black-translucent" },
};

// viewportFit "cover": no app instalado (iOS) o conteúdo usa a tela toda e as
// margens do notch / barra de gestos vêm de env(safe-area-inset-*)
export const viewport: Viewport = { themeColor: "#09090b", colorScheme: "dark", viewportFit: "cover" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <body>
        {children}
        <Pwa />
        <WebVitals />
      </body>
    </html>
  );
}
