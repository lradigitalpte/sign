import { FileSignature, ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";

import { LocaleSwitcher } from "@/components/shared/locale-switcher";

type AuthShellProps = {
  children: ReactNode;
  title: string;
  description: string;
  eyebrow?: string;
};

export async function AuthShell({ children, description, eyebrow, title }: AuthShellProps) {
  const t = await getTranslations("AuthLayout");
  return (
    <main className="workspace-canvas relative grid min-h-screen place-items-center overflow-hidden px-4 py-10 sm:px-6">
      <div className="pointer-events-none absolute -start-24 top-16 size-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -end-24 bottom-10 size-80 rounded-full bg-info/10 blur-3xl" />
      <div className="absolute end-4 top-4 sm:end-7 sm:top-6"><LocaleSwitcher /></div>
      <div className="relative w-full max-w-md">
        <Link className="mb-7 flex items-center justify-center gap-3" href="/">
          <span className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20"><FileSignature className="size-5" /></span>
          <span><span className="block text-sm font-semibold tracking-[-0.02em]">{t("productName")}</span><span className="block text-xs text-muted-foreground">{t("tagline")}</span></span>
        </Link>
        <section className="clay-panel rounded-[2rem] p-6 sm:p-8">
          {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{eyebrow}</p> : null}
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
          <div className="mt-7">{children}</div>
        </section>
        <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground"><ShieldCheck className="size-3.5" />{t("securityNote")}</p>
      </div>
    </main>
  );
}
