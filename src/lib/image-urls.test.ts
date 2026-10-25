import { describe, expect, it } from "vitest";
import { thumbOf, variantPaths } from "./image-urls";

const base = "https://x.supabase.co/storage/v1/object/public/profile-media/u1/post-1-abc";

describe("miniaturas", () => {
  it("foto nova (-hd) aponta para a miniatura (-sd)", () => {
    expect(thumbOf(`${base}-hd.jpg`)).toBe(`${base}-sd.jpg`);
  });

  it("foto antiga e avatar ficam como estão (sem pedir arquivo que não existe)", () => {
    expect(thumbOf(`${base}.jpg`)).toBe(`${base}.jpg`);
    expect(thumbOf("https://avatars.steamstatic.com/abc_full.jpg")).toBe("https://avatars.steamstatic.com/abc_full.jpg");
  });

  it("caminhos do par", () => {
    expect(variantPaths("u1/post-1-abc")).toEqual({ full: "u1/post-1-abc-hd.jpg", thumb: "u1/post-1-abc-sd.jpg" });
  });
});
