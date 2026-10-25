// URLs das fotos enviadas (server e client).
//
// Desde as miniaturas, cada foto de post/clube/mensagem vira dois arquivos:
//   <nome>-hd.jpg  original reduzido (até 1600 px) → tela cheia
//   <nome>-sd.jpg  miniatura (até 960 px)          → feed, clubes, conversas
// Fotos antigas (sem o "-hd") não têm miniatura: usam o próprio arquivo.

const HD = "-hd.jpg";
const SD = "-sd.jpg";

/** Versão leve para listas. Sem miniatura (foto antiga, avatar), devolve a própria URL. */
export function thumbOf(url: string): string {
  return url.endsWith(HD) ? `${url.slice(0, -HD.length)}${SD}` : url;
}

/** Caminhos no Storage de uma foto com miniatura (`base` sem extensão). */
export function variantPaths(base: string): { full: string; thumb: string } {
  return { full: `${base}${HD}`, thumb: `${base}${SD}` };
}
