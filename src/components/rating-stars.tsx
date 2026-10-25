import { Star } from "lucide-react";

/** Nota de 1 a 5 (somente leitura). */
export function RatingStars({ value, size = "sm" }: { value: number; size?: "sm" | "md" }) {
  const cls = size === "sm" ? "size-3.5" : "size-5";
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`Nota ${value} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`${cls} ${n <= value ? "fill-amber-400 text-amber-400" : "text-zinc-600"}`} aria-hidden />
      ))}
    </span>
  );
}
