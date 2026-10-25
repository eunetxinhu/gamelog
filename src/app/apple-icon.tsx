import { appIcon } from "@/lib/app-icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Ícone da tela inicial no iPhone/iPad (o iOS arredonda sozinho). */
export default function AppleIcon() {
  return appIcon(180, { rounded: false });
}
