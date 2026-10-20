"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";

import { useEntitlements } from "@/hooks/use-envelope-api";

const FEATURE_PLANS: Record<string, { plan: string; planId: string }> = {
  teams_and_groups: { plan: "Business", planId: "business" },
};

/**
 * Shows children when the workspace's plan includes the feature (or plan limits aren't switched on);
 * otherwise a short note with a way to upgrade. The API enforces the same rule.
 */
export function PlanFeature({ feature, what, children }: { feature: keyof typeof FEATURE_PLANS; what: string; children: ReactNode }) {
  const entitlements = useEntitlements().data;
  const blocked = entitlements?.enforced && entitlements.features[feature] === false;
  if (!blocked) return <>{children}</>;
  const { plan, planId } = FEATURE_PLANS[feature];
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm sm:flex-row sm:items-center">
      <Sparkles className="size-4 shrink-0 text-primary" />
      <p className="flex-1">
        {what} {what.endsWith("s") ? "are" : "is"} on the {plan} plan and above. Your workspace is on {entitlements?.plan === "free" ? "Free" : "a plan without it"}.
      </p>
      <Link href={`/checkout/${planId}`} className="font-semibold text-primary hover:underline">
        Upgrade to {plan}
      </Link>
    </div>
  );
}
