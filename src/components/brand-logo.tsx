import { SITE_NAME } from "@/lib/brand";

/**
 * Logo do site (arte em public/brand). `full` inclui a linha em katakana (ポーネグリフ),
 * para usos grandes; a versão normal é só o nome, para o topo das páginas.
 */
export function BrandLogo({ full = false, className = "" }: { full?: boolean; className?: string }) {
  const [src, w, h] = full ? ["/brand/logo-completo.png", 1080, 253] : ["/brand/logo.png", 720, 123];
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} width={w} height={h} alt={SITE_NAME} draggable={false} className={`w-auto select-none ${className}`} />;
}
