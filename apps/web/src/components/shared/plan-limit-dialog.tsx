"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PLAN_LIMIT_EVENT, type PlanLimit } from "@/lib/platform-api";

const TITLES: Record<PlanLimit["code"], string> = {
  plan_required: "Not included in your plan",
  seat_limit: "No sender seats left",
  send_limit: "Monthly sends used up",
};

/** Explains a plan limit the API refused an action for, wherever in the app it happened. */
export function PlanLimitDialog() {
  const [limit, setLimit] = useState<PlanLimit | null>(null);

  useEffect(() => {
    const show = (event: Event) => setLimit((event as CustomEvent<PlanLimit>).detail);
    window.addEventListener(PLAN_LIMIT_EVENT, show);
    return () => window.removeEventListener(PLAN_LIMIT_EVENT, show);
  }, []);

  return (
    <Dialog open={limit !== null} onOpenChange={(open) => !open && setLimit(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <span className="mb-1 grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <Sparkles className="size-5" />
          </span>
          <DialogTitle>{limit ? (TITLES[limit.code] ?? "Plan limit reached") : ""}</DialogTitle>
          <DialogDescription>{limit?.error}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setLimit(null)}>
            Not now
          </Button>
          <Button asChild onClick={() => setLimit(null)}>
            <Link href="/pricing">Compare plans</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
