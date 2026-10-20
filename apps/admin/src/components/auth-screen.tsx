import { ArrowUpRight, Lock } from "lucide-react";
import type { ReactNode } from "react";

import { SignetLogoIcon } from "@signet/ui/components/signet-logo";

const environment = import.meta.env.MODE === "production" ? null : import.meta.env.MODE;
const webUrl = import.meta.env.VITE_WEB_URL ?? "http://localhost:3000";

function Logo({ onDark = false }: { onDark?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid size-9 place-items-center rounded-xl bg-linear-to-br from-blue-500 to-blue-700 ring-1 ring-white/20">
        <SignetLogoIcon className="size-5 text-white" />
      </span>
      <span className="font-semibold tracking-tight">Signet</span>
      <span
        className={
          onDark
            ? "rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-200"
            : "rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
        }
      >
        Admin
      </span>
    </span>
  );
}

function BrandPanel() {
  return (
    <aside className="relative hidden overflow-hidden bg-[#08122b] p-12 text-white lg:flex lg:flex-col lg:justify-between">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(40rem 28rem at 85% 5%, rgb(59 130 246 / 0.35), transparent 70%), radial-gradient(30rem 24rem at 0% 100%, rgb(37 99 235 / 0.28), transparent 70%)",
        }}
        aria-hidden
      />
      <div className="relative">
        <Logo onDark />
      </div>
      <div className="relative max-w-md">
        <h2 className="text-4xl font-semibold leading-tight tracking-tight text-balance">Manage Signet, with every change on the record.</h2>
        <p className="mt-4 text-white/60">Restricted to Signet staff.</p>
      </div>
    </aside>
  );
}

/** Full-screen layout for every pre-app state: checking access, signed out, no access, API unreachable. */
export function AuthScreen({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-2">
      <BrandPanel />

      <section className="flex min-h-screen flex-col px-6 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <span className="lg:invisible">
            <Logo />
          </span>
          {environment ? <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium capitalize text-amber-700 dark:text-amber-300">{environment}</span> : null}
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>

        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Lock className="size-3.5" /> Secured by WorkOS
          </span>
          <a href={webUrl} className="inline-flex items-center gap-1 hover:text-foreground">
            Go to Signet <ArrowUpRight className="size-3.5" />
          </a>
        </div>
      </section>
    </main>
  );
}

/** Heading block used inside AuthScreen. */
export function AuthHeading({ icon, title, description }: { icon?: ReactNode; title: string; description: ReactNode }) {
  return (
    <div>
      {icon}
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}
