"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { CircleAlert, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useStartCheckout } from "@/hooks/use-envelope-api";
import { MAX_ONLINE_SEATS, type BillingCycle } from "@/lib/plans";

// The public checkout page sends buyers here. Being under /settings, it makes them sign in (or sign up)
// first, so the plan lands on their workspace; then it hands them to Stripe Checkout. A workspace that
// already pays has its subscription changed in place and comes straight back to Billing.
export default function BillingCheckoutPage() {
  return (
    <Suspense>
      <StartCheckout />
    </Suspense>
  );
}

function StartCheckout() {
  const params = useSearchParams();
  const router = useRouter();
  const checkout = useStartCheckout();
  const started = useRef(false);

  const plan = params.get("plan") ?? "";
  const cycle: BillingCycle = params.get("cycle") === "monthly" ? "monthly" : "annual";
  const seats = Math.min(Math.max(Math.trunc(Number(params.get("seats"))) || 1, 1), MAX_ONLINE_SEATS);

  useEffect(() => {
    // Strict mode runs effects twice in development; start only one checkout.
    if (started.current) return;
    started.current = true;
    checkout.mutate(
      { plan, cycle, seats },
      {
        onSuccess: (result) => {
          if (result.url) window.location.assign(result.url);
          else router.replace("/settings/billing?checkout=updated");
        },
      },
    );
  }, [checkout, plan, cycle, seats, router]);

  return (
    <main className="mx-auto w-full max-w-lg px-3 py-20 sm:px-0">
      <div className="rounded-3xl border bg-card p-8 text-center shadow-sm">
        {checkout.isError ? (
          <>
            <CircleAlert className="mx-auto size-8 text-destructive" />
            <h1 className="mt-4 text-xl font-semibold">Couldn&apos;t start checkout</h1>
            <p role="alert" className="mt-2 text-sm leading-6 text-muted-foreground">
              {checkout.error instanceof Error ? checkout.error.message : "Something went wrong."}
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild variant="outline">
                <Link href={`/checkout/${encodeURIComponent(plan)}?cycle=${cycle}&seats=${seats}`}>Back to checkout</Link>
              </Button>
              <Button asChild>
                <Link href="/settings/billing">Go to Billing</Link>
              </Button>
            </div>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto size-8 animate-spin text-muted-foreground" />
            <h1 className="mt-4 text-xl font-semibold">Taking you to secure payment…</h1>
            <p className="mt-2 text-sm text-muted-foreground">You&apos;ll enter your card on Stripe&apos;s page, then come back here.</p>
          </>
        )}
      </div>
    </main>
  );
}
