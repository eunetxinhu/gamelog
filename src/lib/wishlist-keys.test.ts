import { describe, expect, it } from "vitest";
import { inWishlist, lookupTerms, wishlistKeySet } from "./wishlist-keys";

describe("wishlist nas listas", () => {
  const set = wishlistKeySet([
    { slug: "hades", steamAppId: 1145360 },
    { slug: "rawg-3498", steamAppId: null },
  ]);

  it("reconhece o jogo pelo slug do GameLog e pelo da loja", () => {
    expect(inWishlist(set, { slug: "hades", steamAppId: 1145360 })).toBe(true);
    expect(inWishlist(set, { slug: "steam-1145360", steamAppId: 1145360 })).toBe(true);
    expect(inWishlist(set, { slug: "rawg-3498", steamAppId: null })).toBe(true);
  });

  it("não confunde com outro jogo", () => {
    expect(inWishlist(set, { slug: "steam-70", steamAppId: 70 })).toBe(false);
    expect(inWishlist(set, { slug: "celeste", steamAppId: null })).toBe(false);
  });

  it("tira o appId de dentro do slug da loja para a consulta", () => {
    expect(lookupTerms([{ slug: "steam-70", steamAppId: null }, { slug: "hades", steamAppId: 1145360 }])).toEqual({
      slugs: ["steam-70", "hades"],
      appIds: [70, 1145360],
    });
  });
});
