import { FileSignature, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { ThemeSwitcher } from "@/components/shared/theme-switcher";

export const metadata: Metadata = {
  title: "Review & Sign Document | Secure Signing",
  description: "Secure, tamper-evident electronic signature session.",
};

export default function SignLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-surface-subtle text-foreground antialiased">
      <header className="flex h-12 shrink-0 items-center justify-between border-b bg-background px-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary text-white">
            <FileSignature className="size-3.5" />
          </span>
          <span className="truncate text-sm font-semibold tracking-tight">Secure Sign</span>
          <span className="hidden items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 sm:inline-flex dark:text-emerald-300">
            <ShieldCheck className="size-3" />
            Encrypted
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <LocaleSwitcher />
          <ThemeSwitcher />
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
