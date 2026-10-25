import type { ReactNode } from "react";
import { SettingsTabs } from "./_components/settings-tabs";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="mx-auto max-w-2xl px-4 pt-8">
        <h1 className="mb-4 text-2xl font-bold text-zinc-50">Configurações</h1>
        <SettingsTabs />
      </div>
      {children}
    </>
  );
}
