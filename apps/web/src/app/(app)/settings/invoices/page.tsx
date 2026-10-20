"use client";

import Link from "next/link";

import { InvoiceList, ManageBillingButton, useBillingDetailsState } from "@/components/settings/billing-parts";
import { PageHeader } from "@/components/shared/page-header";
import { useMe } from "@/hooks/use-envelope-api";

// Invoices come from Stripe. The company name, address and tax ID printed on them are entered at
// checkout and changed in Stripe's billing portal, so this page doesn't keep a copy of its own.
export default function InvoicesPage() {
  const billing = useBillingDetailsState();
  const me = useMe();
  const canManage = me.data?.workspace.role === "owner" || me.data?.workspace.role === "admin";
  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        eyebrow="Organisation settings"
        title="Invoices"
        description="Every charge on this workspace. Company name, address and tax ID on invoices are set in billing details."
        actions={billing.details?.hasAccount && canManage ? <ManageBillingButton label="Edit billing details" /> : null}
      />
      <section className="rounded-3xl border bg-card p-5 shadow-sm sm:p-6">
        <InvoiceList details={billing.details} loading={billing.loading} error={billing.error} />
        {billing.details && !billing.details.hasAccount ? (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Buy a plan from <Link href="/settings/billing" className="font-semibold text-primary">Billing &amp; plan</Link> to get invoices.
          </p>
        ) : null}
      </section>
    </div>
  );
}
