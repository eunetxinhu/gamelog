import { describe, expect, it } from "vitest";
import { MAX_PHOTOS, photoVerb, validatePhotoPost } from "./photo-post";

const mine = (u: string) => u.startsWith("https://x.supabase.co/storage/v1/object/public/profile-media/me/");
const photo = (n: number) => `https://x.supabase.co/storage/v1/object/public/profile-media/me/post-${n}.jpg`;
const base = { gameSlug: "steam-1245620", images: [photo(1)], caption: "", containsSpoiler: false };

describe("validatePhotoPost", () => {
  it("exige um jogo", () => {
    expect(validatePhotoPost({ ...base, gameSlug: "" }, mine)).toEqual({ ok: false, message: "Escolha de qual jogo são as fotos." });
    expect(validatePhotoPost({ ...base, gameSlug: "../etc" }, mine).ok).toBe(false);
  });

  it("exige de 1 a 4 fotos e tira repetidas", () => {
    expect(validatePhotoPost({ ...base, images: [] }, mine).ok).toBe(false);
    expect(validatePhotoPost({ ...base, images: [1, 2, 3, 4, 5].map(photo) }, mine).ok).toBe(false);
    const dup = validatePhotoPost({ ...base, images: [photo(1), photo(1), photo(2)] }, mine);
    expect(dup.ok && dup.value.images).toEqual([photo(1), photo(2)]);
    expect(validatePhotoPost({ ...base, images: Array.from({ length: MAX_PHOTOS }, (_, i) => photo(i)) }, mine).ok).toBe(true);
  });

  it("recusa foto que não é da própria pessoa", () => {
    const other = "https://x.supabase.co/storage/v1/object/public/profile-media/outra-pessoa/post.jpg";
    expect(validatePhotoPost({ ...base, images: [photo(1), other] }, mine).ok).toBe(false);
    expect(validatePhotoPost({ ...base, images: ["https://evil.com/a.jpg"] }, mine).ok).toBe(false);
  });

  it("legenda opcional; spoiler só vale com legenda", () => {
    const noCaption = validatePhotoPost({ ...base, containsSpoiler: true }, mine);
    expect(noCaption.ok && noCaption.value).toMatchObject({ caption: null, containsSpoiler: false });
    const withCaption = validatePhotoPost({ ...base, caption: "  chefe final!  ", containsSpoiler: true }, mine);
    expect(withCaption.ok && withCaption.value).toMatchObject({ caption: "chefe final!", containsSpoiler: true });
  });

  it("normaliza o slug", () => {
    const r = validatePhotoPost({ ...base, gameSlug: " STEAM-1245620 " }, mine);
    expect(r.ok && r.value.gameSlug).toBe("steam-1245620");
  });
});

describe("photoVerb", () => {
  it("singular e plural", () => {
    expect(photoVerb(1)).toBe("compartilhou uma foto de");
    expect(photoVerb(3)).toBe("compartilhou 3 fotos de");
  });
});
