import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  // Base das URLs absolutas dos cards de compartilhamento (opengraph-image)
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: "GameLog",
  description: "Registre, avalie e compartilhe seus jogos, platinas e reviews.",
  openGraph: { siteName: "GameLog", locale: "pt_BR", type: "website" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <body>{children}</body>
    </html>
  );
}
