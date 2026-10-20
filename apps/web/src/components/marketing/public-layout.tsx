import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Check } from "lucide-react";

import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { cn } from "@/lib/utils";

type PillTone = "accent" | "ink" | "ghost" | "outline" | "light";

export function PillLink({
  href,
  children,
  tone = "accent",
  arrow = true,
  className,
}: {
  href: string;
  children: ReactNode;
  tone?: PillTone;
  arrow?: boolean;
  className?: string;
}) {
  const tones: Record<PillTone, string> = {
    accent: "bg-(--site-accent) text-white shadow-lg shadow-(--site-accent)/25 hover:bg-(--site-accent-hover)",
    ink: "bg-(--site-ink) text-white hover:bg-(--site-ink-2)",
    ghost: "text-white ring-1 ring-white/25 hover:bg-white/10",
    outline: "bg-(--site-card) text-(--site-text) ring-1 ring-(--site-line) hover:bg-(--site-tint)",
    light: "bg-white text-(--site-ink) hover:bg-white/90",
  };
  const arrowTones: Record<PillTone, string> = {
    accent: "bg-white text-(--site-accent)",
    ink: "bg-(--site-accent) text-white",
    ghost: "bg-white/15",
    outline: "bg-(--site-accent) text-white",
    light: "bg-(--site-accent) text-white",
  };
  const external = href.startsWith("mailto:");
  const classes = cn(
    "group inline-flex h-12 items-center gap-3 rounded-full text-sm font-semibold transition",
    arrow ? "ps-6 pe-2" : "px-6",
    tones[tone],
    className,
  );
  const content = (
    <>
      {children}
      {arrow ? (
        <span className={cn("grid size-8 place-items-center rounded-full", arrowTones[tone])}>
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" />
        </span>
      ) : null}
    </>
  );

  return external ? (
    <a href={href} className={classes}>
      {content}
    </a>
  ) : (
    <Link href={href} className={classes}>
      {content}
    </Link>
  );
}

export function Eyebrow({ children, onDark = false }: { children: ReactNode; onDark?: boolean }) {
  return (
    <p
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium",
        onDark ? "bg-white/10 text-white/85 ring-1 ring-white/15" : "bg-(--site-card) text-(--site-text) ring-1 ring-(--site-line)",
      )}
    >
      <span className={cn("size-1.5 rounded-full", onDark ? "bg-(--site-accent-soft)" : "bg-(--site-accent)")} aria-hidden />
      {children}
    </p>
  );
}

/** Glow and grid texture behind dark hero bands */
export function HeroBackdrop() {
  return (
    <>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(48rem 30rem at 82% 8%, rgb(59 130 246 / 0.32), transparent 70%), radial-gradient(36rem 26rem at 8% 95%, rgb(37 99 235 / 0.28), transparent 70%), radial-gradient(28rem 20rem at 50% 50%, rgb(99 102 241 / 0.10), transparent 70%)",
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage: "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
        }}
        aria-hidden
      />
    </>
  );
}

/** Dark intro band that sits under the floating header on public pages */
export function PageHero({
  eyebrow,
  title,
  description,
  children,
  align = "start",
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  align?: "start" | "center";
}) {
  return (
    <section className="relative overflow-hidden rounded-b-[2rem] bg-(--site-ink) text-white sm:rounded-b-[3rem]">
      <HeroBackdrop />
      <div className={cn("site-container relative pb-16 pt-32 sm:pb-24 sm:pt-44", align === "center" && "text-center")}>
        <div className={cn("max-w-4xl", align === "center" && "mx-auto")}>
          {eyebrow ? <Eyebrow onDark>{eyebrow}</Eyebrow> : null}
          <h1 className="mt-6 text-4xl font-semibold leading-[1.05] tracking-tight text-balance sm:text-6xl xl:text-7xl">{title}</h1>
          {description ? <p className={cn("mt-6 max-w-2xl text-base leading-7 text-white/70 sm:text-lg sm:leading-8", align === "center" && "mx-auto")}>{description}</p> : null}
          {children ? <div className={cn("mt-9 flex flex-wrap items-center gap-3", align === "center" && "justify-center")}>{children}</div> : null}
        </div>
      </div>
    </section>
  );
}

/** Highlighted words inside a dark hero title */
export function Highlight({ children }: { children: ReactNode }) {
  return <span className="bg-linear-to-r from-(--site-accent-soft) to-sky-300 bg-clip-text text-transparent">{children}</span>;
}

export function SectionHeading({ eyebrow, title, description, className }: { eyebrow: string; title: ReactNode; description?: ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-6 lg:grid-cols-2 lg:items-end", className)}>
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="mt-5 text-3xl font-semibold tracking-tight text-balance text-(--site-text) sm:text-5xl">{title}</h2>
      </div>
      {description ? <p className="max-w-lg text-base leading-7 text-(--site-muted) lg:justify-self-end">{description}</p> : null}
    </div>
  );
}

export function CtaBand({
  title = "Send your first document today",
  description = "Create a workspace, upload a PDF, and invite signers in minutes. No credit card to start.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <section className="site-container pb-20 sm:pb-28">
      <div className="relative flex flex-col items-start gap-8 overflow-hidden rounded-[2rem] bg-(--site-accent) px-6 py-12 text-white sm:px-14 sm:py-16 lg:flex-row lg:items-center lg:justify-between">
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(40rem 20rem at 90% 0%, rgb(255 255 255 / 0.22), transparent 70%)" }}
          aria-hidden
        />
        <div className="pointer-events-none absolute -bottom-28 end-1/3 size-72 rounded-full border-[40px] border-white/10" aria-hidden />
        <div className="relative max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-5xl">{title}</h2>
          <p className="mt-4 text-base leading-7 text-white/80 sm:text-lg">{description}</p>
        </div>
        <div className="relative flex flex-wrap items-center gap-3">
          <PillLink href="/signup" tone="light">
            Create free account
          </PillLink>
          <Link href="/signin" className="inline-flex h-12 items-center rounded-full px-6 text-sm font-semibold ring-1 ring-white/35 transition hover:bg-white/10">
            Sign in
          </Link>
        </div>
      </div>
    </section>
  );
}

/** Content card on the light page background */
export function PublicCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-3xl bg-card p-6 text-card-foreground ring-1 ring-border sm:p-8", className)}>{children}</div>;
}

/** Check bullet used in lists across public pages */
export function CheckDot({ onDark = false }: { onDark?: boolean }) {
  return (
    <span className={cn("grid size-5 shrink-0 place-items-center rounded-full", onDark ? "bg-(--site-accent)/25 text-(--site-accent-soft)" : "bg-(--site-accent) text-white")}>
      <Check className="size-3" />
    </span>
  );
}

/**
 * Shell for public pages: floating header, optional dark hero, content, footer.
 * Pages that draw their own dark top section (home, pricing) pass `darkTop`.
 * `contained` wraps children in the standard page width and spacing; pass false for full-bleed sections.
 */
export function PublicLayout({
  children,
  hero,
  darkTop = false,
  contained = true,
  className,
}: {
  children: ReactNode;
  hero?: ReactNode;
  darkTop?: boolean;
  contained?: boolean;
  className?: string;
}) {
  const overDark = darkTop || Boolean(hero);
  return (
    <div className="site-surface flex min-h-screen flex-col bg-(--site-bg) text-(--site-text)">
      <SiteHeader solid={!overDark} />
      {hero}
      <main className={cn("flex-1", contained && "site-container py-14 sm:py-20", !overDark && "pt-28 sm:pt-32", className)}>{children}</main>
      <SiteFooter />
    </div>
  );
}
