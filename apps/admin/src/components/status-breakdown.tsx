import { cn } from "@signet/ui/lib/utils";

import { Card } from "@/components/page";
import { envelopeStatusLabels, formatNumber } from "@/lib/format";
import type { EnvelopeStatus } from "@/lib/types";

const statusOrder: EnvelopeStatus[] = ["completed", "in_progress", "draft", "expired", "voided"];
const statusFill: Record<EnvelopeStatus, string> = {
  completed: "bg-emerald-500",
  in_progress: "bg-amber-500",
  draft: "bg-slate-400 dark:bg-slate-500",
  expired: "bg-slate-300 dark:bg-slate-600",
  voided: "bg-red-500",
};

export function StatusBreakdown({ counts }: { counts: Record<EnvelopeStatus, number> }) {
  const total = statusOrder.reduce((sum, status) => sum + (counts[status] ?? 0), 0);
  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Envelopes by status</h2>
        <span className="text-sm text-muted-foreground">{formatNumber(total)} total</span>
      </div>
      <div className="mt-5 flex h-3 gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        {total > 0 ? statusOrder.map((status) => (counts[status] ? <div key={status} className={statusFill[status]} style={{ width: `${(counts[status] / total) * 100}%` }} /> : null)) : null}
      </div>
      <ul className="mt-5 space-y-2.5">
        {statusOrder.map((status) => {
          const count = counts[status] ?? 0;
          return (
            <li key={status} className="flex items-center gap-3 text-sm">
              <span className={cn("size-2.5 rounded-full", statusFill[status])} aria-hidden />
              <span className="flex-1">{envelopeStatusLabels[status]}</span>
              <span className="font-semibold tabular-nums">{formatNumber(count)}</span>
              <span className="w-10 text-end text-xs text-muted-foreground tabular-nums">{total ? `${Math.round((count / total) * 100)}%` : "—"}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
