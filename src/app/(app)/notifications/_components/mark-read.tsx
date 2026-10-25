"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { markNotificationsRead } from "@/app/(app)/_actions/social";

/** Ao abrir a página, marca tudo como lido e atualiza o contador do sino. */
export function MarkRead() {
  const router = useRouter();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    markNotificationsRead().then(() => router.refresh());
  }, [router]);
  return null;
}
