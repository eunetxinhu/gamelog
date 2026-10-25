import Link from "next/link";
import { splitMentions } from "@/lib/mentions";

/** Texto com @menções virando link para o perfil. */
export function MentionText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className}>
      {splitMentions(text).map((p, i) =>
        p.type === "text" ? (
          <span key={i}>{p.value}</span>
        ) : (
          <Link key={i} href={`/u/${p.username}`} className="font-medium text-sky-400 hover:underline">
            @{p.username}
          </Link>
        ),
      )}
    </span>
  );
}
