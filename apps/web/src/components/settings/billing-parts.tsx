"use client";

import { CreditCard, Download, ExternalLink, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useBillingDetails, useBillingPortal } from "@/hooks/use-envelope-api";
import type { BillingDetails } from "@/lib/platform-api";

const shortDate = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" });

const formatAmount = (cents: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() || "USD" }).format(cents / 100);

const invoiceStatus: Record<string, { label: string; className: string }> = {
  paid: { label: "Paid", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  open: { label: "Due", className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  uncollectible: { label: "Unpaid", className: "bg-red-500/10 text-red-700 dark:text-red-300" },
  void: { label: "Void", className: "bg-muted text-muted-foreground" },
};

/** Opens Stripe's customer portal (cards, invoices, billing details, cancellation) in this tab. */
export function ManageBillingButton({ label = "Manage billing", variant = "outline" }: { label?: string; variant?: "outline" | "default" }) {
  const portal = useBillingPortal();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant={variant}
        disabled={portal.isPending}
        onClick={() => portal.mutate(undefined, { onSuccess: (result) => window.location.assign(result.url) })}
      >
        {portal.isPending ? <Loader2 className="animate-spin" /> : <ExternalLink />}
        {label}
      </Button>
      {portal.isError ? <p role="alert" className="max-w-xs text-right text-xs text-destructive">{portal.error instanceof Error ? portal.error.message : "Couldn't open billing."}</p> : null}
    </div>
  );
}

export function PaymentMethod({ details, loading }: { details?: BillingDetails; loading: boolean }) {
  if (loading) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading…</p>;
  if (details && !details.enabled) {
    return <div className="rounded-2xl border border-dashed p-4 text-center"><p className="text-sm font-medium">Online payments aren&apos;t available yet</p><p className="mt-1 text-xs text-muted-foreground">Contact sales to set up or change a paid plan.</p></div>;
  }
  const card = details?.paymentMethod;
  if (!card) {
    return <div className="rounded-2xl border border-dashed p-4 text-center"><p className="text-sm font-medium">No payment method on file</p><p className="mt-1 text-xs text-muted-foreground">You&apos;ll add one when you buy a plan.</p></div>;
  }
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-surface-subtle/70 p-4">
      <span className="grid size-10 place-items-center rounded-xl bg-background text-muted-foreground"><CreditCard className="size-4" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold capitalize">{card.brand} ending in {card.last4}</p>
        <p className="text-xs text-muted-foreground">Expires {String(card.expMonth).padStart(2, "0")}/{card.expYear}</p>
      </div>
    </div>
  );
}

export function InvoiceList({ details, loading, error }: { details?: BillingDetails; loading: boolean; error?: unknown }) {
  if (loading) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading invoices…</p>;
  if (error) return <p role="alert" className="text-sm text-destructive">{error instanceof Error ? error.message : "Couldn't load invoices."}</p>;
  if (!details?.invoices.length) {
    return <div className="rounded-2xl border border-dashed p-8 text-center"><p className="text-sm font-medium">You have no invoices</p><p className="mt-1 text-xs text-muted-foreground">Invoices appear here after your first payment, and Stripe emails a receipt for each one.</p></div>;
  }
  return (
    <ul className="divide-y rounded-2xl border">
      {details.invoices.map((invoice) => {
        const status = invoiceStatus[invoice.status] ?? { label: invoice.status, className: "bg-muted text-muted-foreground" };
        return (
          <li key={invoice.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
            <span className="min-w-0 flex-1">
              <span className="font-medium">{invoice.number || "Invoice"}</span>
              <span className="block text-xs text-muted-foreground">{shortDate.format(new Date(invoice.createdAt))}</span>
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.className}`}>{status.label}</span>
            <span className="w-24 text-right font-semibold tabular-nums">{formatAmount(invoice.amountCents, invoice.currency)}</span>
            <span className="flex gap-1">
              {invoice.url ? <Button asChild variant="ghost" size="sm"><a href={invoice.url} target="_blank" rel="noreferrer">{invoice.status === "open" ? "Pay" : "View"}</a></Button> : null}
              {invoice.pdfUrl ? <Button asChild variant="ghost" size="icon-sm" aria-label={`Download ${invoice.number || "invoice"} as PDF`}><a href={invoice.pdfUrl} target="_blank" rel="noreferrer"><Download /></a></Button> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Billing details shared by the Billing and Invoices pages. */
export function useBillingDetailsState() {
  const details = useBillingDetails();
  return { details: details.data, loading: details.isLoading, error: details.error };
}
