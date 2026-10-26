import { describe, expect, it } from "vitest";
import { isOwnStoragePath, sniffImageType, storagePath } from "./storage-url";

const BASE = "https://abc.supabase.co";
const U = "aaaaaaaa-0000-4000-8000-000000000001";
const url = (path: string) => `${BASE}/storage/v1/object/public/profile-media/${path}`;

describe("storagePath", () => {
  it("aceita arquivo do nosso bucket", () => {
    expect(storagePath(url(`${U}/post-1761-abc123-hd.jpg`), BASE)).toBe(`${U}/post-1761-abc123-hd.jpg`);
  });

  it("recusa domínio parecido (antes passava pelo startsWith)", () => {
    expect(storagePath(`https://abc.supabase.co.evil.com/storage/v1/object/public/profile-media/${U}/x.jpg`, BASE)).toBeNull();
    expect(storagePath(`https://abc.supabase.co@evil.com/storage/v1/object/public/profile-media/${U}/x.jpg`, BASE)).toBeNull();
    expect(storagePath(`http://abc.supabase.co/storage/v1/object/public/profile-media/${U}/x.jpg`, BASE)).toBeNull();
  });

  it("recusa outro bucket, subpastas e caminhos tortos", () => {
    expect(storagePath(`${BASE}/storage/v1/object/public/outro/${U}/x.jpg`, BASE)).toBeNull();
    expect(storagePath(url(`${U}/../outro/x.jpg`), BASE)).toBeNull();
    expect(storagePath(url(`${U}/%2e%2e/x.jpg`), BASE)).toBeNull();
    expect(storagePath(url(`${U}/a/b.jpg`), BASE)).toBeNull();
    expect(storagePath(url(`${U}%2Fx.jpg`), BASE)).toBeNull();
    expect(storagePath("nem-url", BASE)).toBeNull();
    expect(storagePath(null, BASE)).toBeNull();
  });

  it("dono do arquivo", () => {
    const p = storagePath(url(`${U}/avatar-1.png`), BASE);
    expect(isOwnStoragePath(p, U)).toBe(true);
    expect(isOwnStoragePath(p, "bbbbbbbb-0000-4000-8000-000000000002")).toBe(false);
    expect(isOwnStoragePath(null, U)).toBe(false);
  });
});

describe("sniffImageType", () => {
  const bytes = (...v: number[]) => new Uint8Array(v);
  const text = (s: string) => new TextEncoder().encode(s);
  it("reconhece JPEG, PNG e WebP pelo conteúdo", () => {
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe("image/png");
    expect(sniffImageType(text("RIFF\u0000\u0000\u0000\u0000WEBPVP8 "))).toBe("image/webp");
  });
  it("recusa HTML/SVG disfarçado de imagem", () => {
    expect(sniffImageType(text("<svg xmlns="))).toBeNull();
    expect(sniffImageType(text("<html><script>"))).toBeNull();
    expect(sniffImageType(bytes())).toBeNull();
  });
});
