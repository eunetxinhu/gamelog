type Props = { name: string; src: string | null; size?: "xs" | "sm" | "md" | "lg" };

const SIZES = { xs: "size-7 text-xs", sm: "size-9 text-sm", md: "size-12 text-base", lg: "size-24 text-3xl" };

/** Foto do usuário (perfil ou Steam) ou a inicial do nome. */
export function Avatar({ name, src, size = "md" }: Props) {
  const cls = `${SIZES[size]} shrink-0 rounded-full ring-1 ring-white/10`;
  if (src) {
    // Listas longas (feed, seguidores): só baixa o que aparece na tela; a foto grande do perfil vem na hora
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" loading={size === "lg" ? "eager" : "lazy"} decoding="async" className={`${cls} object-cover`} />;
  }
  return (
    <span className={`${cls} flex items-center justify-center bg-gradient-to-br from-brand-600 to-ember-700 font-bold uppercase text-white`}>
      {name.charAt(0)}
    </span>
  );
}
