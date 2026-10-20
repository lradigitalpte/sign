import Link from "next/link";
import { ArrowUpRight, Layers, Lock, Mail, ScrollText, UserCheck, type LucideIcon } from "lucide-react";

import { FooterControls } from "@/components/marketing/footer-controls";
import { COMPANY_LINKS, PRODUCT_LINKS, SOLUTION_LINKS, SignetWordmark } from "@/components/marketing/site-chrome";

const columns: { title: string; links: { label: string; href: string }[] }[] = [
  { title: "Product", links: [...PRODUCT_LINKS.filter((link) => link.href !== "/pricing#compare"), { label: "Pricing", href: "/pricing" }] },
  { title: "Solutions", links: SOLUTION_LINKS },
  { title: "Company", links: COMPANY_LINKS },
  {
    title: "Account",
    links: [
      { label: "Sign in", href: "/signin" },
      { label: "Create account", href: "/signup" },
      { label: "Compare plans", href: "/pricing#compare" },
    ],
  },
];

const assurances: { icon: LucideIcon; label: string }[] = [
  { icon: ScrollText, label: "Audit trail on every envelope" },
  { icon: Lock, label: "Recipient-specific signing links" },
  { icon: UserCheck, label: "Signers never need an account" },
  { icon: Layers, label: "Bring your own storage on Enterprise" },
];

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative isolate overflow-hidden rounded-t-[2rem] bg-(--site-ink) text-white sm:rounded-t-[3rem]">
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div className="absolute -top-40 start-[10%] size-[28rem] rounded-full bg-(--site-accent)/25 blur-3xl" />
        <div className="absolute -bottom-48 end-[5%] size-[32rem] rounded-full bg-indigo-500/15 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
            backgroundSize: "64px 64px",
            maskImage: "linear-gradient(to bottom, black, transparent 70%)",
            WebkitMaskImage: "linear-gradient(to bottom, black, transparent 70%)",
          }}
        />
      </div>

      <div className="site-container">
        <div className="grid gap-14 pb-14 pt-16 sm:pt-20 lg:grid-cols-[1.1fr_2fr] lg:gap-20">
          <div>
            <Link href="/" aria-label="Signet home" className="inline-block">
              <SignetWordmark />
            </Link>
            <p className="mt-6 max-w-sm text-2xl font-semibold leading-snug tracking-tight text-balance">
              Prepare, send, and track agreements in <span className="text-(--site-accent-soft)">one workspace.</span>
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/signup"
                className="inline-flex h-11 items-center rounded-full bg-(--site-accent) px-5 text-sm font-semibold shadow-lg shadow-(--site-accent)/30 transition hover:bg-(--site-accent-hover)"
              >
                Get started free
              </Link>
              <a
                href="mailto:hello@send.frogmentec.ae?subject=Signet%20Enterprise"
                className="inline-flex h-11 items-center rounded-full px-5 text-sm font-semibold ring-1 ring-white/20 transition hover:bg-white/10"
              >
                Talk to sales
              </a>
            </div>
            <a
              href="mailto:hello@send.frogmentec.ae"
              className="group mt-8 inline-flex items-center gap-3 rounded-2xl bg-white/5 p-3 pe-5 ring-1 ring-white/10 transition hover:bg-white/10"
            >
              <span className="grid size-10 place-items-center rounded-xl bg-white/10 text-(--site-accent-soft)">
                <Mail className="size-4" />
              </span>
              <span>
                <span className="block text-xs text-white/50">Questions? Email us</span>
                <span className="block text-sm font-medium">hello@send.frogmentec.ae</span>
              </span>
            </a>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4">
            {columns.map(({ title, links }) => (
              <div key={title}>
                <p className="text-xs font-semibold uppercase tracking-wider text-(--site-accent-soft)">{title}</p>
                <ul className="mt-5 space-y-3.5 text-sm">
                  {links.map(({ label, href }) => (
                    <li key={href}>
                      <Link href={href} className="group inline-flex items-center gap-1 text-white/65 transition hover:text-white">
                        {label}
                        <ArrowUpRight className="size-3.5 -translate-x-1 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100 rtl:-scale-x-100" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <ul className="grid gap-3 border-y border-white/10 py-6 sm:grid-cols-2 lg:grid-cols-4">
          {assurances.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-3 text-sm text-white/70">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-(--site-accent)/20 text-(--site-accent-soft) ring-1 ring-(--site-accent)/25">
                <Icon className="size-4" />
              </span>
              {label}
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-5 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/50">
            <p>© {year} Signet. All rights reserved.</p>
            <Link href="/privacy" className="transition hover:text-white">
              Privacy
            </Link>
            <Link href="/terms" className="transition hover:text-white">
              Terms
            </Link>
            <Link href="/security" className="transition hover:text-white">
              Security
            </Link>
          </div>
          <FooterControls />
        </div>
      </div>

      <p
        aria-hidden
        className="pointer-events-none -mb-[0.22em] select-none bg-linear-to-b from-white/[0.14] to-white/0 bg-clip-text text-center text-[26vw] font-semibold leading-[0.8] tracking-tighter text-transparent"
      >
        Signet
      </p>
    </footer>
  );
}
