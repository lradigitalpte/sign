import Link from "next/link";
import {
  ArrowUpRight,
  CircleCheck,
  Clock,
  Eye,
  FileCheck,
  Layers,
  Lock,
  ScrollText,
  Send,
  ShieldCheck,
  Smartphone,
  Upload,
  Users,
} from "lucide-react";

import { CheckDot, CtaBand, Eyebrow, HeroBackdrop, Highlight, PillLink, PublicLayout, SectionHeading } from "@/components/marketing/public-layout";
import { cn } from "@/lib/utils";

const previewRecipients = [
  { name: "Amara Okafor", role: "Signer · 1", status: "Signed", icon: CircleCheck, tone: "bg-emerald-50 text-emerald-700 ring-emerald-600/15" },
  { name: "Daniel Reyes", role: "Approver · 2", status: "Viewed", icon: Eye, tone: "bg-blue-50 text-blue-700 ring-blue-600/15" },
  { name: "Legal team", role: "Copy", status: "Waiting", icon: Clock, tone: "bg-slate-100 text-slate-600 ring-slate-500/15" },
];

function EnvelopePreview() {
  return (
    <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
      <div className="absolute -inset-8 rounded-[3rem] bg-(--site-accent)/25 blur-3xl" aria-hidden />

      <div className="relative rounded-[1.75rem] bg-white/10 p-2 ring-1 ring-white/15 backdrop-blur">
        <div className="rounded-3xl bg-white p-4 text-slate-900 shadow-2xl shadow-black/40 sm:p-6">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-600/10">
                <ScrollText className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">Master services agreement.pdf</p>
                <p className="text-xs text-slate-500">2 of 3 recipients done</p>
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-600/15">In progress</span>
          </div>

          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
            <div className="h-full w-2/3 rounded-full bg-linear-to-r from-blue-500 to-blue-600" />
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_1.15fr]">
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200" aria-hidden>
              <div className="h-2 w-2/3 rounded-full bg-slate-300" />
              <div className="mt-3 space-y-1.5">
                <div className="h-1.5 rounded-full bg-slate-200" />
                <div className="h-1.5 rounded-full bg-slate-200" />
                <div className="h-1.5 w-4/5 rounded-full bg-slate-200" />
                <div className="h-1.5 rounded-full bg-slate-200" />
                <div className="h-1.5 w-3/5 rounded-full bg-slate-200" />
              </div>
              <div className="mt-5 rounded-lg border-2 border-dashed border-blue-400/60 bg-blue-50 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-600">Signature</p>
                <p className="font-serif text-xl italic leading-tight text-slate-800">A. Okafor</p>
              </div>
              <div className="mt-2 flex gap-2">
                <div className="h-6 flex-1 rounded-md border border-dashed border-slate-300 bg-white" />
                <div className="h-6 w-16 rounded-md border border-dashed border-slate-300 bg-white" />
              </div>
            </div>

            <ul className="space-y-2">
              {previewRecipients.map(({ name, role, status, icon: Icon, tone }) => (
                <li key={name} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                    {name
                      .split(" ")
                      .map((part) => part[0])
                      .join("")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{name}</p>
                    <p className="text-xs text-slate-500">{role}</p>
                  </div>
                  <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", tone)}>
                    <Icon className="size-3" />
                    {status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="relative mt-3 flex items-center gap-3 rounded-2xl bg-(--site-accent) px-4 py-3 text-white shadow-xl shadow-(--site-accent)/40 ring-1 ring-white/20 sm:absolute sm:-bottom-7 sm:-start-7 sm:mt-0 sm:max-w-64">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/15">
          <ShieldCheck className="size-4" />
        </span>
        <p className="text-xs font-semibold leading-snug">Every action recorded in the envelope&apos;s audit trail</p>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden rounded-b-[2rem] bg-(--site-ink) text-white sm:rounded-b-[3rem]">
      <HeroBackdrop />

      <div className="site-container relative grid items-center gap-16 pb-20 pt-32 sm:pb-28 sm:pt-44 lg:grid-cols-[1fr_1.05fr] lg:gap-14 xl:gap-20">
        <div>
          <Eyebrow onDark>Electronic signatures for teams</Eyebrow>
          <h1 className="mt-6 text-4xl font-semibold leading-[1.04] tracking-tight text-balance sm:text-6xl xl:text-7xl">
            Prepare, send, and track agreements in <Highlight>one workspace.</Highlight>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-white/70 sm:text-lg sm:leading-8">
            Upload PDFs, assign signers, and keep completed documents with their activity history. Built for your team, simple for everyone who signs.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <PillLink href="/signup">Send your first document</PillLink>
            <PillLink href="/pricing" tone="ghost" arrow={false}>
              View pricing
            </PillLink>
          </div>
          <ul className="mt-10 flex flex-wrap gap-x-7 gap-y-3 text-sm text-white/75">
            {["No credit card to start", "Signers are always free", "No account needed to sign"].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <CheckDot onDark />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <EnvelopePreview />
      </div>
    </section>
  );
}

const workflow = [
  {
    icon: Upload,
    step: "01",
    title: "Prepare the document",
    body: "Upload a PDF and place signature, date, text, and checkbox fields for each recipient.",
    tone: "light",
  },
  {
    icon: Send,
    step: "02",
    title: "Send in the right order",
    body: "Assign signer, approver, and copy roles, then send recipient-specific links in the order you choose.",
    tone: "accent",
  },
  {
    icon: FileCheck,
    step: "03",
    title: "Track and keep the record",
    body: "Follow status from sent to completed, then download the signed PDF with its certificate and activity history.",
    tone: "ink",
  },
] as const;

function Workflow() {
  return (
    <section className="py-20 sm:py-28">
      <div className="site-container">
        <SectionHeading
          eyebrow="How it works"
          title="From upload to signed in three steps"
          description="One flow for every agreement your team sends. Your team prepares and sends; recipients just open their link and sign."
        />

        <div className="mt-14 grid gap-5 md:grid-cols-3 lg:gap-6">
          {workflow.map(({ icon: Icon, step, title, body, tone }) => (
            <article
              key={step}
              className={cn(
                "relative flex min-h-80 flex-col overflow-hidden rounded-[1.75rem] p-8",
                tone === "light" && "bg-(--site-card) text-(--site-text) ring-1 ring-(--site-line)",
                tone === "accent" && "bg-(--site-accent) text-white shadow-xl shadow-(--site-accent)/25",
                tone === "ink" && "bg-(--site-ink) text-white ring-1 ring-white/10",
              )}
            >
              {tone === "accent" ? (
                <div className="pointer-events-none absolute -bottom-16 -end-16 size-56 rounded-full border-[32px] border-white/10" aria-hidden />
              ) : null}
              {tone === "ink" ? <div className="pointer-events-none absolute -end-16 -top-16 size-48 rounded-full bg-(--site-accent)/30 blur-3xl" aria-hidden /> : null}
              <div className="relative flex items-start justify-between">
                <span
                  className={cn(
                    "grid size-12 place-items-center rounded-2xl",
                    tone === "light" && "bg-(--site-tint) text-(--site-accent)",
                    tone === "accent" && "bg-white/15 text-white",
                    tone === "ink" && "bg-white/10 text-(--site-accent-soft)",
                  )}
                >
                  <Icon className="size-5" />
                </span>
                <span className={cn("text-sm font-semibold", tone === "light" ? "text-(--site-muted)" : "text-white/50")}>{step}</span>
              </div>
              <h3 className="relative mt-10 text-2xl font-semibold tracking-tight">{title}</h3>
              <p className={cn("relative mt-3 text-sm leading-6", tone === "light" ? "text-(--site-muted)" : tone === "accent" ? "text-white/80" : "text-white/65")}>{body}</p>
              <Link
                href="/features"
                className={cn(
                  "relative mt-auto inline-flex w-fit items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition",
                  tone === "light" && "bg-(--site-tint) text-(--site-accent) hover:bg-(--site-accent) hover:text-white",
                  tone === "accent" && "bg-white text-(--site-accent) hover:bg-white/90",
                  tone === "ink" && "bg-(--site-accent) text-white hover:bg-(--site-accent-hover)",
                )}
              >
                Explore features
                <ArrowUpRight className="size-3.5 rtl:-scale-x-100" />
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

const activity = [
  { label: "Envelope sent to 3 recipients", time: "09:12" },
  { label: "Viewed by Amara Okafor", time: "09:40" },
  { label: "Signed by Amara Okafor", time: "09:46" },
  { label: "Completed · certificate issued", time: "10:03" },
];

const solutions = [
  ["Sales", "/solutions#sales"],
  ["People operations", "/solutions#people"],
  ["Legal", "/solutions#legal"],
  ["Client services", "/solutions#clients"],
] as const;

function WhySignet() {
  return (
    <section className="bg-(--site-card) py-20 sm:py-28">
      <div className="site-container grid gap-14 lg:grid-cols-2 lg:items-center lg:gap-20">
        <div className="grid grid-cols-2 gap-4 lg:gap-5">
          <div className="relative col-span-2 overflow-hidden rounded-[1.75rem] bg-(--site-ink) p-7 text-white ring-1 ring-white/10">
            <div className="pointer-events-none absolute -end-20 -top-20 size-56 rounded-full bg-(--site-accent)/30 blur-3xl" aria-hidden />
            <div className="relative flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">Activity history</p>
              <span className="truncate rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-white/70">Master services agreement</span>
            </div>
            <ol className="relative mt-6 space-y-4">
              {activity.map(({ label, time }, index) => (
                <li key={label} className="relative flex items-center gap-3 ps-1">
                  {index < activity.length - 1 ? <span className="absolute start-[0.6875rem] top-6 h-6 w-px bg-white/15" aria-hidden /> : null}
                  <span
                    className={cn(
                      "size-3.5 shrink-0 rounded-full ring-4",
                      index === activity.length - 1 ? "bg-(--site-accent-soft) ring-(--site-accent)/30" : "bg-white/40 ring-white/5",
                    )}
                  />
                  <span className="flex-1 text-sm text-white/80">{label}</span>
                  <span className="font-mono text-xs text-white/45">{time}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="relative flex flex-col justify-between overflow-hidden rounded-[1.75rem] bg-(--site-accent) p-7 text-white shadow-xl shadow-(--site-accent)/25">
            <div className="pointer-events-none absolute -bottom-12 -end-12 size-36 rounded-full border-[22px] border-white/10" aria-hidden />
            <CircleCheck className="relative size-6" />
            <div className="relative mt-10">
              <p className="text-5xl font-semibold tracking-tight">$0</p>
              <p className="mt-2 text-sm font-medium text-white/80">for signers. Pay per seat only for people who send.</p>
            </div>
          </div>
          <div className="flex flex-col justify-between rounded-[1.75rem] bg-(--site-bg) p-7 text-(--site-text) ring-1 ring-(--site-line)">
            <span className="grid size-11 place-items-center rounded-2xl bg-(--site-tint) text-(--site-accent)">
              <Smartphone className="size-5" />
            </span>
            <div className="mt-10">
              <p className="text-lg font-semibold">Any device</p>
              <p className="mt-1 text-sm text-(--site-muted)">Recipients sign from phone, tablet, or desktop without an account.</p>
            </div>
          </div>
        </div>

        <div>
          <Eyebrow>Why Signet</Eyebrow>
          <h2 className="mt-5 text-3xl font-semibold tracking-tight text-balance text-(--site-text) sm:text-5xl">One workspace for every agreement your team sends</h2>
          <p className="mt-6 text-base leading-7 text-(--site-muted) sm:text-lg sm:leading-8">
            Stop chasing signatures over email. Signet keeps documents, recipients, and their history together, so anyone on the team can see where an agreement stands.
          </p>
          <ul className="mt-8 grid gap-3.5 sm:grid-cols-2">
            {[
              "Signing links tied to one recipient and one envelope",
              "Templates and roles for agreements you send again and again",
              "Workspace roles, including read-only auditor access",
              "Completion certificates for every finished document",
            ].map((item) => (
              <li key={item} className="flex gap-3 text-sm leading-6 text-(--site-text)">
                <span className="mt-0.5">
                  <CheckDot />
                </span>
                {item}
              </li>
            ))}
          </ul>

          <div className="mt-9 rounded-3xl bg-(--site-bg) p-5 ring-1 ring-(--site-line)">
            <p className="text-sm font-semibold text-(--site-text)">Built for</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {solutions.map(([label, href]) => (
                <Link
                  key={href}
                  href={href}
                  className="rounded-full bg-(--site-card) px-3.5 py-1.5 text-xs font-medium text-(--site-text) ring-1 ring-(--site-line) transition hover:bg-(--site-accent) hover:text-white hover:ring-(--site-accent)"
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-9 flex flex-wrap items-center gap-4">
            <PillLink href="/features" tone="ink">
              Explore features
            </PillLink>
            <Link href="/contact" className="text-sm font-semibold text-(--site-accent) underline-offset-4 hover:underline">
              Talk to us
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

const securityPoints = [
  { icon: Lock, title: "Recipient-specific links", body: "Each signing link belongs to one recipient and one envelope." },
  { icon: Users, title: "Workspace roles", body: "Control who can send, manage, or only review, including read-only auditors." },
  { icon: ScrollText, title: "Audit trail", body: "Activity history stays with each envelope from sent to completed." },
  { icon: Layers, title: "Your own storage", body: "Enterprise teams can keep documents in their own S3 or Cloudflare R2." },
];

function Security() {
  return (
    <section className="site-container py-20 sm:py-28">
      <div className="relative overflow-hidden rounded-[2rem] bg-(--site-ink) px-6 py-12 text-white ring-1 ring-white/10 sm:px-14 sm:py-16">
        <HeroBackdrop />
        <div className="relative grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <div>
            <Eyebrow onDark>Security & control</Eyebrow>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight text-balance sm:text-5xl">Control built into every envelope, not added later</h2>
            <p className="mt-5 text-base leading-7 text-white/65 sm:text-lg sm:leading-8">
              Access controls and activity history are part of the signing flow, so the record is complete when the last signature lands.
            </p>
            <PillLink href="/security" className="mt-9">
              Read about security
            </PillLink>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {securityPoints.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-3xl bg-white/6 p-6 ring-1 ring-white/10 backdrop-blur transition hover:bg-white/9">
                <span className="grid size-11 place-items-center rounded-2xl bg-(--site-accent) text-white shadow-lg shadow-(--site-accent)/30">
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-6 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-white/60">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function HomePage() {
  return (
    <PublicLayout darkTop contained={false}>
      <Hero />
      <Workflow />
      <WhySignet />
      <Security />
      <CtaBand />
    </PublicLayout>
  );
}
