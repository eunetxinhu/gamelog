import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Pwa } from "@/components/pwa";

export const metadata: Metadata = {
  // Base das URLs absolutas dos cards de compartilhamento (opengraph-image)
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: "GameLog",
  description: "Registre, avalie e compartilhe seus jogos, platinas e reviews.",
  openGraph: { siteName: "GameLog", locale: "pt_BR", type: "website" },
  applicationName: "GameLog",
  appleWebApp: { capable: true, title: "GameLog", statusBarStyle: "black-translucent" },
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
      </body>
    </html>
  );
}
