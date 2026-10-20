import type { Metadata } from "next";
import { Building2, Mail } from "lucide-react";

import { CtaBand, Eyebrow, HeroBackdrop, PillLink, PublicCard, PublicLayout } from "@/components/marketing/public-layout";
import { PlansProvider } from "@/components/marketing/plans-context";
import { PricingPlans } from "@/components/marketing/pricing-plans";
import { getLivePlans } from "@/lib/plan-prices";
import { FAQS, MAX_ONLINE_SEATS } from "@/lib/plans";

export const metadata: Metadata = {
  title: { absolute: "Pricing · Signet" },
  description: "Per-seat pricing for senders. Recipients sign for free.",
};

export default async function PricingPage() {
  const plans = await getLivePlans();
  return (
    <PublicLayout darkTop contained={false}>
      <PlansProvider plans={plans}>
        <PricingPlans />
      </PlansProvider>

      <section className="site-container py-20 sm:py-28">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <Eyebrow>FAQ</Eyebrow>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight text-balance sm:text-5xl">Billing questions, answered</h2>
            <p className="mt-5 text-base leading-7 text-muted-foreground">Still unsure about something? Email us and we&apos;ll help you pick the right plan.</p>

            <div className="relative mt-8 overflow-hidden rounded-[1.75rem] bg-(--site-ink) p-7 text-white ring-1 ring-white/10">
              <HeroBackdrop />
              <span className="relative grid size-12 place-items-center rounded-2xl bg-(--site-accent) shadow-lg shadow-(--site-accent)/30">
                <Building2 className="size-5" />
              </span>
              <h3 className="relative mt-6 text-xl font-semibold">More than {MAX_ONLINE_SEATS} seats?</h3>
              <p className="relative mt-2 text-sm leading-6 text-white/65">Enterprise pricing, invoicing, and custom storage for larger teams.</p>
              <div className="relative mt-7 flex flex-wrap items-center gap-4">
                <PillLink href="mailto:hello@send.frogmentec.ae?subject=Signet%20Enterprise" tone="light">
                  Talk to sales
                </PillLink>
                <a href="mailto:hello@send.frogmentec.ae" className="inline-flex items-center gap-2 text-sm text-white/70 transition hover:text-white">
                  <Mail className="size-4" />
                  hello@send.frogmentec.ae
                </a>
              </div>
            </div>
          </div>

          <PublicCard className="px-2 py-2 sm:px-4 sm:py-3">
            <div className="divide-y divide-border">
              {FAQS.map((faq, index) => (
                <details key={faq.q} className="group px-4 py-5 sm:px-5" open={index === 0}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold [&::-webkit-details-marker]:hidden">
                    {faq.q}
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-(--site-tint) text-lg text-(--site-accent) transition group-open:rotate-45 group-open:bg-(--site-accent) group-open:text-white">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 pe-12 text-sm leading-7 text-muted-foreground">{faq.a}</p>
                </details>
              ))}
            </div>
          </PublicCard>
        </div>
      </section>

      <CtaBand title="Create your workspace" />
    </PublicLayout>
  );
}
