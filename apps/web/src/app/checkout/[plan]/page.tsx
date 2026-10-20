import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CheckoutForm } from "@/components/marketing/checkout-form";
import { PlansProvider } from "@/components/marketing/plans-context";
import { PublicLayout } from "@/components/marketing/public-layout";
import { getLivePlans } from "@/lib/plan-prices";
import { MAX_ONLINE_SEATS, getPlan, type BillingCycle } from "@/lib/plans";

export const metadata: Metadata = { title: { absolute: "Checkout · Signet" } };

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ plan: string }>;
  searchParams: Promise<{ cycle?: string; seats?: string; canceled?: string }>;
}) {
  const [{ plan: planId }, { cycle, seats, canceled }, plans] = await Promise.all([params, searchParams, getLivePlans()]);
  const plan = getPlan(planId, plans);
  if (!plan?.price) notFound();
  const initialCycle: BillingCycle = cycle === "monthly" ? "monthly" : "annual";
  const initialSeats = Math.min(Math.max(Math.trunc(Number(seats)) || 1, 1), MAX_ONLINE_SEATS);

  return (
    <PublicLayout contained={false}>
      <PlansProvider plans={plans}>
        <CheckoutForm initialPlan={plan.id} initialCycle={initialCycle} initialSeats={initialSeats} canceled={canceled === "1"} />
      </PlansProvider>
    </PublicLayout>
  );
}
