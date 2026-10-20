import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowUpRight,
  BellRing,
  Briefcase,
  FileCheck,
  FolderOpen,
  Handshake,
  KeyRound,
  Layers,
  Lock,
  LockKeyhole,
  Mail,
  Palette,
  PenTool,
  Route,
  Scale,
  ScrollText,
  Send,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";

import { CheckDot, CtaBand, Eyebrow, HeroBackdrop, Highlight, PageHero, PillLink, PublicCard, PublicLayout, SectionHeading } from "@/components/marketing/public-layout";
import { cn } from "@/lib/utils";

type Feature = { icon: LucideIcon; title: string; body: string; badge?: string };

function Section({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("site-container py-20 sm:py-28", className)}>{children}</section>;
}

function FeatureGrid({ items, className }: { items: Feature[]; className?: string }) {
  return (
    <div className={cn("grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6", className)}>
      {items.map(({ icon: Icon, title, body, badge }) => (
        <article
          key={title}
          className="group flex flex-col rounded-[1.75rem] bg-(--site-card) p-8 ring-1 ring-(--site-line) transition duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-(--site-accent)/10 hover:ring-(--site-accent)/30"
        >
          <div className="flex items-start justify-between gap-3">
            <span className="grid size-12 place-items-center rounded-2xl bg-(--site-tint) text-(--site-accent) transition group-hover:bg-(--site-accent) group-hover:text-white">
              <Icon className="size-5" />
            </span>
            {badge ? <span className="rounded-full bg-(--site-ink) px-2.5 py-1 text-[11px] font-semibold text-white">{badge}</span> : null}
          </div>
          <h3 className="mt-7 text-lg font-semibold text-(--site-text)">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-(--site-muted)">{body}</p>
        </article>
      ))}
    </div>
  );
}

const steps = [
  { icon: Upload, title: "Upload and prepare", body: "Upload a PDF and add fields for each recipient." },
  { icon: Send, title: "Send in order", body: "Send secure invitations in the order you choose." },
  { icon: FileCheck, title: "Download and review", body: "Download the signed PDF and review the activity trail." },
];

function Steps() {
  return (
    <div id="workflow" className="scroll-mt-28">
      <SectionHeading eyebrow="How it works" title="From upload to signed in three steps" description="The same flow for every envelope, whether it has one signer or a full approval chain." />
      <ol className="mt-14 grid gap-5 md:grid-cols-3 lg:gap-6">
        {steps.map(({ icon: Icon, title, body }, index) => (
          <li
            key={title}
            className={cn(
              "relative flex min-h-64 flex-col overflow-hidden rounded-[1.75rem] p-8",
              index === 0 && "bg-(--site-card) ring-1 ring-(--site-line)",
              index === 1 && "bg-(--site-accent) text-white shadow-xl shadow-(--site-accent)/25",
              index === 2 && "bg-(--site-ink) text-white ring-1 ring-white/10",
            )}
          >
            <div className="flex items-start justify-between">
              <span
                className={cn(
                  "grid size-12 place-items-center rounded-2xl",
                  index === 0 && "bg-(--site-tint) text-(--site-accent)",
                  index === 1 && "bg-white/15",
                  index === 2 && "bg-white/10 text-(--site-accent-soft)",
                )}
              >
                <Icon className="size-5" />
              </span>
              <span className={cn("text-sm font-semibold", index === 0 ? "text-(--site-muted)" : "text-white/50")}>0{index + 1}</span>
            </div>
            <h3 className="mt-auto pt-10 text-2xl font-semibold tracking-tight">{title}</h3>
            <p className={cn("mt-2 text-sm leading-6", index === 0 ? "text-(--site-muted)" : index === 1 ? "text-white/80" : "text-white/65")}>{body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

const features: Feature[] = [
  { icon: PenTool, title: "Fields on any PDF", body: "Place signature, initials, date, text, and checkbox fields before sending." },
  { icon: Route, title: "Roles and signing order", body: "Assign signer, approver, and copy roles, sequential or in parallel." },
  { icon: BellRing, title: "Reminders and expiration", body: "Automatic reminders on a schedule you set, plus document expiration dates." },
  { icon: ScrollText, title: "Status at a glance", body: "Track sent, viewed, and completed status for every envelope from your workspace." },
  { icon: FileCheck, title: "Certificates and history", body: "Download completion certificates and audit history with finished files." },
  { icon: FolderOpen, title: "Templates and folders", body: "Reuse templates for repeat agreements and keep work organized in shared folders." },
  { icon: Users, title: "Teams and member roles", body: "Organize senders into teams and groups with owner, admin, member, and viewer roles." },
  { icon: Palette, title: "Your brand on emails", body: "Put your logo and colors on the emails recipients receive." },
  { icon: LockKeyhole, title: "PDF encryption vault", body: "Encrypt sensitive documents, rotate passwords, and verify encrypted files.", badge: "Premium" },
];

export function FeaturesPage() {
  return (
    <PublicLayout
      contained={false}
      hero={
        <PageHero
          eyebrow="Features"
          title={
            <>
              Everything you need to get agreements <Highlight>signed.</Highlight>
            </>
          }
          description="Tools to prepare PDFs, coordinate recipients, collect signatures, and retain a record with each completed envelope."
        >
          <PillLink href="/signup">Get started</PillLink>
          <PillLink href="/pricing" tone="ghost" arrow={false}>
            View pricing
          </PillLink>
        </PageHero>
      }
    >
      <Section>
        <SectionHeading eyebrow="Product" title="Built for the people who send and the people who sign" description="Senders get the controls they need. Recipients get a link, a clear document, and nothing to install." />
        <FeatureGrid items={features} className="mt-14" />
        <p className="mt-10 text-sm text-(--site-muted)">
          Feature availability depends on your plan.{" "}
          <Link href="/pricing#compare" className="font-semibold text-(--site-accent) underline-offset-4 hover:underline">
            Compare plans
          </Link>
        </p>
      </Section>
      <Section className="pt-0 sm:pt-0">
        <Steps />
      </Section>
      <CtaBand />
    </PublicLayout>
  );
}

const solutions = [
  {
    id: "sales",
    icon: Briefcase,
    title: "Sales",
    copy: "Proposals and contracts from approved to signed without email chaos.",
    points: ["Approver role before the customer signs", "Reminders keep deals moving", "Redirect signers to your site when they finish"],
  },
  {
    id: "people",
    icon: Users,
    title: "People operations",
    copy: "Offers and onboarding with status you can see for every hire.",
    points: ["Templates for offer letters and policies", "Status for every document in one place", "New hires sign on any device"],
  },
  {
    id: "legal",
    icon: Scale,
    title: "Legal",
    copy: "Templates, roles, and audit history for repeat agreements.",
    points: ["Signing order for multi-party agreements", "Audit trail and completion certificate", "Read-only auditor access for reviews"],
  },
  {
    id: "clients",
    icon: Handshake,
    title: "Client services",
    copy: "Clients sign on any device, with no account required.",
    points: ["Recipient-specific signing links", "Your logo and colors on emails", "File-upload fields to collect documents"],
  },
];

export function SolutionsPage() {
  return (
    <PublicLayout
      contained={false}
      hero={
        <PageHero
          eyebrow="Solutions"
          title={
            <>
              One signing workflow for <Highlight>every team.</Highlight>
            </>
          }
          description="The same signing workflow for sales, HR, legal, and client-facing teams, so every agreement is tracked the same way."
        >
          <PillLink href="/signup">Get started</PillLink>
          <PillLink href="/contact" tone="ghost" arrow={false}>
            Talk to us
          </PillLink>
        </PageHero>
      }
    >
      <Section>
        <nav aria-label="Teams" className="flex flex-wrap gap-2">
          {solutions.map(({ id, title, icon: Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              className="inline-flex items-center gap-2 rounded-full bg-(--site-card) px-4 py-2 text-sm font-medium ring-1 ring-(--site-line) transition hover:bg-(--site-accent) hover:text-white hover:ring-(--site-accent)"
            >
              <Icon className="size-4" />
              {title}
            </a>
          ))}
        </nav>
        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:gap-6">
          {solutions.map(({ id, icon: Icon, title, copy, points }, index) => {
            const dark = index === 1 || index === 2;
            return (
              <section
                id={id}
                key={id}
                className={cn(
                  "relative flex scroll-mt-28 flex-col overflow-hidden rounded-[1.75rem] p-8 sm:p-10",
                  dark ? "bg-(--site-ink) text-white ring-1 ring-white/10" : "bg-(--site-card) ring-1 ring-(--site-line)",
                )}
              >
                {dark ? <div className="pointer-events-none absolute -end-20 -top-20 size-60 rounded-full bg-(--site-accent)/30 blur-3xl" aria-hidden /> : null}
                <span className={cn("relative grid size-12 place-items-center rounded-2xl", dark ? "bg-(--site-accent) text-white" : "bg-(--site-tint) text-(--site-accent)")}>
                  <Icon className="size-5" />
                </span>
                <h2 className="relative mt-7 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
                <p className={cn("relative mt-2 leading-7", dark ? "text-white/65" : "text-(--site-muted)")}>{copy}</p>
                <ul className="relative mt-7 space-y-3">
                  {points.map((point) => (
                    <li key={point} className="flex gap-3 text-sm">
                      <CheckDot onDark={dark} />
                      {point}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/features"
                  className={cn(
                    "relative mt-9 inline-flex w-fit items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition",
                    dark ? "bg-(--site-accent) text-white hover:bg-(--site-accent-hover)" : "bg-(--site-tint) text-(--site-accent) hover:bg-(--site-accent) hover:text-white",
                  )}
                >
                  Explore features
                  <ArrowUpRight className="size-3.5 rtl:-scale-x-100" />
                </Link>
              </section>
            );
          })}
        </div>
      </Section>
      <CtaBand />
    </PublicLayout>
  );
}

const securityFeatures: Feature[] = [
  { icon: Lock, title: "Recipient-specific links", body: "Signing links are tied to one recipient and one envelope." },
  { icon: KeyRound, title: "Signer passcodes", body: "Require a passcode before a recipient can open and sign." },
  { icon: Users, title: "Workspace roles", body: "Owner, admin, member, and viewer roles, including read-only auditor access." },
  { icon: ScrollText, title: "Activity history", body: "Activity history is kept with each envelope through completion." },
  { icon: FileCheck, title: "Completion certificates", body: "Completion certificates are available for finished documents." },
  { icon: Layers, title: "Bring your own storage", body: "Keep documents in your own AWS S3, Cloudflare R2, or S3-compatible storage.", badge: "Enterprise" },
];

export function SecurityPage() {
  return (
    <PublicLayout
      contained={false}
      hero={
        <PageHero
          eyebrow="Security & control"
          title={
            <>
              Control built into every envelope, <Highlight>not added later.</Highlight>
            </>
          }
          description="Access controls and activity history are part of the signing flow, so the record is complete when the last signature lands."
        >
          <PillLink href="/signup">Get started</PillLink>
          <PillLink href="mailto:hello@send.frogmentec.ae?subject=Signet%20security" tone="ghost" arrow={false}>
            Ask a security question
          </PillLink>
        </PageHero>
      }
    >
      <Section>
        <SectionHeading eyebrow="What's included" title="Protection at every step of the signing flow" description="From the moment you send to the final certificate, each action is tied to a person and recorded." />
        <FeatureGrid items={securityFeatures} className="mt-14" />
      </Section>

      <Section className="pt-0 sm:pt-0">
        <div className="relative grid gap-10 overflow-hidden rounded-[2rem] bg-(--site-ink) p-8 text-white ring-1 ring-white/10 sm:p-14 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <HeroBackdrop />
          <div className="relative">
            <Eyebrow onDark>Audit trail</Eyebrow>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight text-balance sm:text-5xl">Every view, signature, and change, recorded</h2>
            <p className="mt-5 text-base leading-7 text-white/65 sm:text-lg">Download the signed PDF together with its completion certificate and the full activity history for the envelope.</p>
          </div>
          <ol className="relative space-y-3">
            {["Envelope sent to 3 recipients", "Viewed by the first signer", "Signed by the first signer", "Completed · certificate issued"].map((event, index, list) => (
              <li key={event} className="flex items-center gap-3 rounded-2xl bg-white/6 px-5 py-4 ring-1 ring-white/10 backdrop-blur">
                <span className={cn("size-3 shrink-0 rounded-full", index === list.length - 1 ? "bg-(--site-accent-soft) ring-4 ring-(--site-accent)/30" : "bg-white/35")} />
                <span className="text-sm text-white/85">{event}</span>
              </li>
            ))}
          </ol>
        </div>
      </Section>

      <CtaBand />
    </PublicLayout>
  );
}

const contactOptions = [
  {
    icon: Briefcase,
    title: "Plans and enterprise",
    body: "Volume pricing beyond 10 seats, invoicing, and your own storage.",
    href: "mailto:hello@send.frogmentec.ae?subject=Signet%20Enterprise",
    cta: "Talk to sales",
  },
  {
    icon: Mail,
    title: "Product questions",
    body: "Questions about Signet or rolling it out to your team.",
    href: "mailto:hello@send.frogmentec.ae?subject=Signet%20question",
    cta: "Email us",
  },
];

export function ContactPage() {
  return (
    <PublicLayout
      hero={
        <PageHero
          eyebrow="Contact"
          title={
            <>
              Let&apos;s <Highlight>talk.</Highlight>
            </>
          }
          description="Questions about Signet, plans, or rolling out to your team? We typically respond within one business day."
        />
      }
    >
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr_1fr] lg:gap-6">
        <div className="relative flex flex-col justify-between overflow-hidden rounded-[1.75rem] bg-(--site-accent) p-8 text-white shadow-xl shadow-(--site-accent)/25 sm:p-10">
          <div className="pointer-events-none absolute -bottom-16 -end-16 size-56 rounded-full border-[32px] border-white/10" aria-hidden />
          <span className="relative grid size-12 place-items-center rounded-2xl bg-white/15">
            <Mail className="size-5" />
          </span>
          <div className="relative mt-14">
            <p className="text-sm font-medium text-white/75">Write to us at</p>
            <a href="mailto:hello@send.frogmentec.ae" className="mt-1 block break-all text-2xl font-semibold tracking-tight hover:underline sm:text-3xl">
              hello@send.frogmentec.ae
            </a>
          </div>
        </div>
        {contactOptions.map(({ icon: Icon, title, body, href, cta }) => (
          <div key={title} className="flex flex-col rounded-[1.75rem] bg-(--site-card) p-8 ring-1 ring-(--site-line)">
            <span className="grid size-12 place-items-center rounded-2xl bg-(--site-tint) text-(--site-accent)">
              <Icon className="size-5" />
            </span>
            <h2 className="mt-7 text-lg font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-(--site-muted)">{body}</p>
            <PillLink href={href} tone="ink" className="mt-10 w-fit">
              {cta}
            </PillLink>
          </div>
        ))}
      </div>
      <p className="mt-10 text-sm text-(--site-muted)">
        Looking for plan details?{" "}
        <Link href="/pricing" className="font-semibold text-(--site-accent) underline-offset-4 hover:underline">
          See pricing
        </Link>
      </p>
    </PublicLayout>
  );
}

export function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  const privacy = kind === "privacy";
  const sections = privacy
    ? [
        ["Information you provide", "Signet processes information you submit to create a workspace, prepare agreements, invite recipients, and use support."],
        ["How information is used", "We use it to provide the service, maintain activity records, support requests, and administer plans."],
        ["Your control", "Workspace members manage documents and recipients in the product. Storage options depend on your plan."],
        ["Contact", "Privacy questions: hello@send.frogmentec.ae"],
      ]
    : [
        ["Using Signet", "Use the service lawfully and within your workspace permissions."],
        ["Your responsibilities", "Accurate workspace data, member access, and rights to documents you upload."],
        ["Billing", "Plan features and limits are shown on the pricing page and at checkout."],
        ["Contact", "Questions: hello@send.frogmentec.ae"],
      ];

  return (
    <PublicLayout
      hero={
        <PageHero
          eyebrow="Legal"
          title={privacy ? "Privacy overview" : "Terms of service"}
          description={privacy ? "How information is used in the Signet workspace." : "Summary of expectations for using Signet."}
        />
      }
    >
      <div className="grid gap-8 lg:grid-cols-[16rem_1fr] lg:gap-12">
        <aside className="lg:sticky lg:top-28 lg:self-start">
          <p className="text-xs text-(--site-muted)">Last updated October 13, 2026</p>
          <nav aria-label="On this page" className="mt-4 hidden space-y-1 lg:block">
            {sections.map(([heading], index) => (
              <a
                key={heading}
                href={`#section-${index + 1}`}
                className="block rounded-xl px-3 py-2 text-sm text-(--site-muted) transition hover:bg-(--site-card) hover:text-(--site-accent)"
              >
                {heading}
              </a>
            ))}
          </nav>
          <div className="mt-4 flex gap-2 lg:mt-6">
            <Link href="/privacy" className={cn("rounded-full px-3.5 py-1.5 text-xs font-semibold ring-1", privacy ? "bg-(--site-accent) text-white ring-(--site-accent)" : "bg-(--site-card) ring-(--site-line)")}>
              Privacy
            </Link>
            <Link href="/terms" className={cn("rounded-full px-3.5 py-1.5 text-xs font-semibold ring-1", !privacy ? "bg-(--site-accent) text-white ring-(--site-accent)" : "bg-(--site-card) ring-(--site-line)")}>
              Terms
            </Link>
          </div>
        </aside>
        <PublicCard className="max-w-4xl space-y-10 sm:p-12">
          {sections.map(([heading, copy], index) => (
            <section key={heading} id={`section-${index + 1}`} className="scroll-mt-28">
              <h2 className="flex items-center gap-3 text-lg font-semibold">
                <span className="grid size-8 place-items-center rounded-full bg-(--site-tint) text-xs text-(--site-accent)">{index + 1}</span>
                {heading}
              </h2>
              <p className="mt-2 ps-11 text-sm leading-7 text-(--site-muted)">{copy}</p>
            </section>
          ))}
        </PublicCard>
      </div>
    </PublicLayout>
  );
}
