import { SITE_NAME } from "@/lib/brand";

/**
 * Logo do site (arte em public/brand). `full` inclui a linha em katakana (ポーネグリフ),
 * para usos grandes; a versão normal é só o nome, para o topo das páginas.
 * WebP (bem mais leve que o PNG) no tamanho certo para a tela; o PNG fica só de reserva.
 */
export function BrandLogo({ full = false, className = "" }: { full?: boolean; className?: string }) {
  const [src, w, h, srcSet, sizes] = full
    ? ["/brand/logo-completo.png", 1080, 253, "/brand/logo-completo-720.webp 720w, /brand/logo-completo-1080.webp 1080w", "280px"]
    : ["/brand/logo.png", 720, 123, "/brand/logo-480.webp 480w, /brand/logo-720.webp 720w", "212px"];
  // Arquivo estático pequeno com srcset próprio: o otimizador de imagens do Next não ajuda aqui
  return (
    // eslint-disable-next-line @next/next/no-img-element -- ver acima
    <img
      src={src}
      srcSet={srcSet}
      sizes={sizes}
      width={w}
      height={h}
      alt={SITE_NAME}
      draggable={false}
      fetchPriority="high"
      className={`w-auto select-none ${className}`}
    />
  );
}
