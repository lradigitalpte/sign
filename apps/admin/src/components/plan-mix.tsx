import { Link } from "react-router";

import { Card } from "@/components/page";
import { formatNumber, planLabels } from "@/lib/format";
import type { PlanId } from "@/lib/types";

const order: PlanId[] = ["free", "starter", "business", "premium", "enterprise"];

/** Workspaces per plan as bars; each row opens the workspace list filtered to that plan. */
export function PlanMix({ counts }: { counts: Record<PlanId, number> }) {
  const total = order.reduce((sum, plan) => sum + (counts[plan] ?? 0), 0);
  const paying = total - (counts.free ?? 0);
  const max = Math.max(1, ...order.map((plan) => counts[plan] ?? 0));
  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">Plans</h2>
        <span className="text-xs text-muted-foreground">
          {formatNumber(paying)} paying of {formatNumber(total)}
        </span>
      </div>
      <ul className="mt-4 space-y-1">
        {order.map((plan) => {
          const count = counts[plan] ?? 0;
          return (
            <li key={plan}>
              <Link to={`/workspaces?plan=${plan}`} className="group grid grid-cols-[5.5rem_1fr_2.5rem] items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/60">
                <span className="text-sm">{planLabels[plan]}</span>
                <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <span className={plan === "free" ? "block h-full rounded-full bg-muted-foreground/40" : "block h-full rounded-full bg-primary"} style={{ width: `${(count / max) * 100}%` }} />
                </span>
                <span className="text-end text-sm font-semibold tabular-nums">{formatNumber(count)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
