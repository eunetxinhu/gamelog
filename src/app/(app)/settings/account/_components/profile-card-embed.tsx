"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

const FORMATS = [
  { id: "markdown", label: "Markdown", hint: "GitHub, Reddit, Discord" },
  { id: "html", label: "HTML", hint: "sites e blogs" },
  { id: "bbcode", label: "BBCode", hint: "fóruns" },
  { id: "link", label: "Link da imagem", hint: "onde só aceita URL" },
] as const;

type Format = (typeof FORMATS)[number]["id"];

/** Card do perfil para incorporar: prévia + códigos prontos para copiar. */
export function ProfileCardEmbed({ username, origin }: { username: string; origin: string }) {
  const [format, setFormat] = useState<Format>("markdown");
  const [copied, setCopied] = useState(false);
  const profile = `${origin}/u/${username}`;
  const image = `${profile}/card.png`;
  const alt = `GameLog de @${username}`;

  const code: Record<Format, string> = {
    markdown: `[![${alt}](${image})](${profile})`,
    html: `<a href="${profile}"><img src="${image}" alt="${alt}" width="600"></a>`,
    bbcode: `[url=${profile}][img]${image}[/img][/url]`,
    link: image,
  };

  async function copy() {
    try {
      await navigator.clipboard.writeText(code[format]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // sem permissão de área de transferência: o texto continua selecionável
    }
  }

  return (
    <div className="space-y-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt={`Prévia: ${alt}`} width={600} height={200} loading="lazy" className="w-full rounded-xl ring-1 ring-white/10" />

      <div className="flex flex-wrap gap-1 rounded-xl border border-zinc-800 bg-zinc-950/60 p-1" role="tablist" aria-label="Formato">
        {FORMATS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={format === f.id}
            onClick={() => {
              setFormat(f.id);
              setCopied(false);
            }}
            className={`flex-1 rounded-lg px-3 py-1.5 text-sm transition ${format === f.id ? "bg-zinc-800 text-zinc-50" : "text-zinc-400 hover:text-zinc-200"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <textarea
          readOnly
          value={code[format]}
          rows={3}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={`Código em ${FORMATS.find((f) => f.id === format)!.label}`}
          className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 pr-24 font-mono text-xs text-zinc-200"
        />
        <button
          type="button"
          onClick={copy}
          className="absolute right-2 top-2 inline-flex items-center gap-1.5 rounded-md bg-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-100 hover:bg-zinc-700"
        >
          {copied ? <Check className="size-3.5 text-emerald-400" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <p className="text-xs text-zinc-500">
        {FORMATS.find((f) => f.id === format)!.hint}. A imagem se atualiza sozinha (a cada hora) com seus números e o que você está jogando.
        Perfil privado mostra só nome e foto.
      </p>
    </div>
  );
}
