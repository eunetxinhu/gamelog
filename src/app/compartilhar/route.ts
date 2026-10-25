import { NextResponse } from "next/server";
import { appUrl } from "@/lib/app-url";

/**
 * Destino do "Compartilhar" do celular (manifest.ts → share_target).
 * Normalmente o service worker atende esse POST antes de chegar aqui (public/sw.js).
 * Se o service worker ainda não estiver ativo, abre o post de fotos vazio em vez de dar erro.
 */
function openComposer() {
  return NextResponse.redirect(new URL("/feed?postar=1", appUrl()), 303);
}

export const POST = openComposer;
export const GET = openComposer;
