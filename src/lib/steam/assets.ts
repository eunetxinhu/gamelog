// URLs públicas das imagens da Steam. Sem "server-only": usado também em Client Components.

const STEAM_ASSETS = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps";

/** Capa vertical da biblioteca (600x900). Nem todo jogo tem: veja `steamHeaderUrl`. */
export function steamCoverUrl(appId: number) {
  return `${STEAM_ASSETS}/${appId}/library_600x900.jpg`;
}

/** Banner horizontal da loja (todo app tem). Fallback quando a capa vertical não existe. */
export function steamHeaderUrl(appId: number) {
  return `${STEAM_ASSETS}/${appId}/header.jpg`;
}

/** Arte larga da biblioteca (hero, ~3840x1240). Boa para capa de fundo do perfil. */
export function steamHeroUrl(appId: number) {
  return `${STEAM_ASSETS}/${appId}/library_hero.jpg`;
}
