import type { ComponentType, SVGProps } from "react";
import { Anchor, Beer, Bomb, Coins, Compass, Crown, Flame, Gem, Map, ScrollText, Shell, Ship, Skull, Star, Swords, Telescope, Waves } from "lucide-react";
import type { AwardSymbol } from "@/lib/awards";

type IconProps = { className?: string };
const base: SVGProps<SVGSVGElement> = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

/** Bandeira pirata clássica: caveira com dois ossos cruzados. */
function JollyRoger({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M7.5 11.5a4.5 4.5 0 1 1 9 0c0 1.4-.6 2.3-1.5 2.9V16h-6v-1.6c-.9-.6-1.5-1.5-1.5-2.9Z" />
      <circle cx="10.2" cy="11.2" r="1" fill="currentColor" stroke="none" />
      <circle cx="13.8" cy="11.2" r="1" fill="currentColor" stroke="none" />
      <path d="M11 16v1.2M13 16v1.2" />
      <path d="m4 18.5 16 3.5M20 18.5 4 22" />
    </svg>
  );
}

/** Timão de navio. */
function Helm({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="1.6" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.9 2.9M16.2 16.2l2.9 2.9M4.9 19.1l2.9-2.9M16.2 7.8l2.9-2.9" />
    </svg>
  );
}

/** Chapéu de palha (genérico: aba larga e faixa). */
function StrawHat({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <ellipse cx="12" cy="15.5" rx="10" ry="3.5" />
      <path d="M6.5 15c0-4.4 2.4-7.5 5.5-7.5s5.5 3.1 5.5 7.5" />
      <path d="M6.8 12.6c3.4 1.1 7 1.1 10.4 0" strokeWidth={2.6} />
    </svg>
  );
}

const ICONS: Record<AwardSymbol, ComponentType<IconProps>> = {
  crown: Crown,
  "jolly-roger": JollyRoger,
  skull: Skull,
  swords: Swords,
  "straw-hat": StrawHat,
  helm: Helm,
  anchor: Anchor,
  ship: Ship,
  compass: Compass,
  map: Map,
  telescope: Telescope,
  wanted: ScrollText,
  berries: Coins,
  gem: Gem,
  bomb: Bomb,
  grog: Beer,
  shell: Shell,
  waves: Waves,
  flame: Flame,
  star: Star,
};

export function AwardIcon({ icon, className = "size-4" }: { icon: AwardSymbol; className?: string }) {
  const Icon = ICONS[icon] ?? Crown;
  return <Icon className={className} aria-hidden />;
}
