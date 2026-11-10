import "server-only";
import { AwsClient } from "aws4fetch";

/**
 * Cloudflare R2 (fotos do site) pela API compatível com S3.
 * Configure na Vercel:
 *   R2_ACCOUNT_ID         id da conta Cloudflare
 *   R2_ACCESS_KEY_ID      token do R2 (leitura e escrita no bucket)
 *   R2_SECRET_ACCESS_KEY
 *   R2_BUCKET             ex.: poneglyph-media
 *   R2_PUBLIC_URL         endereço público do bucket (https://pub-….r2.dev ou um domínio seu)
 */
const env = () => ({
  account: process.env.R2_ACCOUNT_ID,
  key: process.env.R2_ACCESS_KEY_ID,
  secret: process.env.R2_SECRET_ACCESS_KEY,
  bucket: process.env.R2_BUCKET,
  publicUrl: process.env.R2_PUBLIC_URL,
});

export function r2Enabled(): boolean {
  const e = env();
  return Boolean(e.account && e.key && e.secret && e.bucket && e.publicUrl);
}

/** Endereço público do bucket (sem barra no fim). */
export function mediaPublicBase(): string | undefined {
  return env().publicUrl?.replace(/\/+$/, "");
}

let client: AwsClient | null = null;
function r2() {
  const e = env();
  if (!r2Enabled()) throw new Error("R2 não configurado (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL)");
  client ??= new AwsClient({ accessKeyId: e.key!, secretAccessKey: e.secret!, service: "s3", region: "auto" });
  // R2_ENDPOINT: só para testes locais com um servidor S3 de mentira
  const host = process.env.R2_ENDPOINT?.replace(/\/+$/, "") ?? `https://${e.account}.r2.cloudflarestorage.com`;
  return { client, endpoint: `${host}/${e.bucket}` };
}

const keyUrl = (endpoint: string, key: string) => `${endpoint}/${key.split("/").map(encodeURIComponent).join("/")}`;

export async function r2Put(key: string, body: Blob | ArrayBuffer | Uint8Array, contentType: string) {
  const { client, endpoint } = r2();
  const res = await client.fetch(keyUrl(endpoint, key), {
    method: "PUT",
    body: body as BodyInit,
    headers: { "content-type": contentType, "cache-control": "public, max-age=31536000, immutable" },
  });
  if (!res.ok) throw new Error(`R2 PUT ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

export async function r2Delete(keys: string[]) {
  const { client, endpoint } = r2();
  for (let i = 0; i < keys.length; i += 10) {
    await Promise.all(
      keys.slice(i, i + 10).map(async (key) => {
        const res = await client.fetch(keyUrl(endpoint, key), { method: "DELETE" });
        // 404 = já não existia
        if (!res.ok && res.status !== 404) throw new Error(`R2 DELETE ${res.status}`);
      }),
    );
  }
}

/** Todas as chaves com o prefixo (pagina pela API S3 ListObjectsV2). */
export async function r2List(prefix: string): Promise<string[]> {
  const { client, endpoint } = r2();
  const keys: string[] = [];
  let token: string | null = null;
  for (let page = 0; page < 100; page++) {
    const url = new URL(endpoint);
    url.searchParams.set("list-type", "2");
    url.searchParams.set("prefix", prefix);
    if (token) url.searchParams.set("continuation-token", token);
    const res = await client.fetch(url.toString());
    if (!res.ok) throw new Error(`R2 LIST ${res.status}`);
    const xml = await res.text();
    for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) keys.push(decodeXml(m[1]));
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? decodeXml(xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1] ?? "") || null : null;
    if (!token) break;
  }
  return keys;
}

function decodeXml(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}
