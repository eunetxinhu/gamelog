"use client";

import { useState, useTransition } from "react";
import { Loader2, UserCheck, UserPlus } from "lucide-react";
import { toggleFollow } from "@/app/(app)/_actions/social";

export function FollowButton({ userId, following: initial }: { userId: string; following: boolean }) {
  const [following, setFollowing] = useState(initial);
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await toggleFollow(userId);
          if (res.ok && res.following !== undefined) setFollowing(res.following);
        })
      }
      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-60 ${
        following ? "border border-zinc-700 text-zinc-200 hover:bg-zinc-800" : "bg-sky-600 text-white hover:bg-sky-500"
      }`}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : following ? (
        <UserCheck className="size-4" aria-hidden />
      ) : (
        <UserPlus className="size-4" aria-hidden />
      )}
      {following ? "Seguindo" : "Seguir"}
    </button>
  );
}
