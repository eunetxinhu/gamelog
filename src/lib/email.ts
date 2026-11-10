import "server-only";

/**
 * E-mails transacionais (confirmar cadastro, nova senha) pelo Resend.
 * Configure na Vercel: RESEND_API_KEY e EMAIL_FROM (ex.: "Poneglyph.gg <nao-responda@poneglyph.gg>",
 * de um domínio verificado no Resend). Sem isso, o cadastro não pede confirmação de e-mail e
 * "esqueci a senha" avisa que o envio está desligado.
 */
export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail({ to, subject, text, html }: { to: string; subject: string; text: string; html: string }): Promise<boolean> {
  if (!emailEnabled()) {
    console.warn("[email] envio desligado (RESEND_API_KEY/EMAIL_FROM); seria para", to, "-", subject);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, text, html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error("[email] Resend respondeu", res.status, (await res.text()).slice(0, 300));
    return res.ok;
  } catch (err) {
    console.error("[email] falhou", err);
    return false;
  }
}

/** Corpo simples (o mesmo texto em HTML e texto puro) com um botão. */
export function linkEmail({ title, intro, action, url, outro }: { title: string; intro: string; action: string; url: string; outro: string }) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  return {
    text: `${title}\n\n${intro}\n\n${action}: ${url}\n\n${outro}`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px;color:#18181b">
<h2 style="margin:0 0 12px">${esc(title)}</h2><p>${esc(intro)}</p>
<p style="margin:24px 0"><a href="${esc(url)}" style="background:#dc2626;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${esc(action)}</a></p>
<p style="color:#71717a;font-size:13px">${esc(outro)}</p><p style="color:#a1a1aa;font-size:12px;word-break:break-all">${esc(url)}</p></div>`,
  };
}
