import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { appUrl } from "@/lib/app-url";
import { BlockedList, InviteLink, PrivacySettings, PushToggle } from "./_components/privacy-form";

export const metadata: Metadata = { title: "Privacidade e notificações · GameLog" };

export default async function PrivacyPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/settings/privacy");

  const [blocks, invites] = await Promise.all([
    prisma.block.findMany({
      where: { blockerId: user.id },
      orderBy: { createdAt: "desc" },
      select: { blocked: { select: { id: true, username: true, displayName: true, avatarUrl: true, steamAvatarUrl: true } } },
    }),
    prisma.user.count({ where: { invitedById: user.id } }),
  ]);

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <Section title="Notificações">
        <PushToggle publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} />
      </Section>

      <Section title="Privacidade">
        <PrivacySettings initial={{ isPrivate: user.isPrivate, dmPolicy: user.dmPolicy }} />
      </Section>

      <Section title="Convidar amigos" description="Quem criar conta pelo seu link já começa seguindo você.">
        <InviteLink url={`${appUrl()}/convite/${user.username}`} invites={invites} />
      </Section>

      <Section title="Bloqueados" description="Quem você bloqueia não vê seu conteúdo, não te segue e não te manda mensagem (e vice-versa).">
        <BlockedList
          users={blocks.map(({ blocked: b }) => ({ id: b.id, username: b.username, displayName: b.displayName, avatar: b.avatarUrl ?? b.steamAvatarUrl }))}
        />
      </Section>
    </main>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-zinc-50">{title}</h2>
      {description && <p className="text-sm text-zinc-400">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
