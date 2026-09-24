"use client";

import { AlertCircle, CheckCircle2, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import type { EnvelopeReview } from "@/lib/platform-api";
import { cn } from "@/lib/utils";

export function PreflightPanel({ review, compact = false }: { review: EnvelopeReview; compact?: boolean }) {
  const t = useTranslations("ReviewSend");
  const ready = review.ready;

  return (
    <div
      className={cn(
        "rounded-2xl border p-4",
        ready
          ? "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
          : "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
      )}
    >
      <div className="flex items-center gap-2 text-sm font-semibold">
        {ready ? <CheckCircle2 className="size-4" /> : <AlertCircle className="size-4" />}
        {ready ? t("allChecksPassed") : t("checksNeedAttention")}
      </div>
      {ready ? (
        <ul className={cn("mt-3 space-y-2 text-xs opacity-80", compact && "mt-2")}>
          <li>
            • {t("checkPdfCount", { count: review.documents.length })}
          </li>
          <li>
            • {t("checkRecipientCount", { count: review.recipients.filter((recipient) => recipient.actionable).length })}
          </li>
          <li>
            • {t("checkFieldCount", { count: review.fieldCounts.required })}
          </li>
        </ul>
      ) : (
        <ul className="mt-3 space-y-2 text-xs">
          {review.errors.map((error) => (
            <li key={error}>• {error}</li>
          ))}
        </ul>
      )}
      {review.warnings.length > 0 ? (
        <ul className="mt-3 space-y-1 border-t border-current/15 pt-3 text-xs opacity-80">
          {review.warnings.map((warning) => (
            <li key={warning}>• {warning}</li>
          ))}
        </ul>
      ) : null}
      {compact && ready ? (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] opacity-70">
          <ShieldCheck className="size-3.5" />
          {t("preflightTitle")}
        </p>
      ) : null}
    </div>
  );
}
