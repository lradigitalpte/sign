"use client";

import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, type ReactNode } from "react";

import { PLANS, withPrices, type Plan, type PlanPriceRow } from "@/lib/plans";
import { platformApiUrl } from "@/lib/platform-api";

const PlansContext = createContext<Plan[]>(PLANS);

/** Hands the live plan catalog, fetched by a server page with getLivePlans, to the pricing components. */
export function PlansProvider({ plans, children }: { plans: Plan[]; children: ReactNode }) {
  return <PlansContext.Provider value={plans}>{children}</PlansContext.Provider>;
}

/** The plan catalog with live prices, or the built-in prices outside a PlansProvider. */
export function usePlans() {
  return useContext(PlansContext);
}

/** The plan catalog with live prices, fetched in the browser, for pages inside the app. */
export function useLivePlans(): Plan[] {
  const prices = useQuery({
    queryKey: ["plan-prices"],
    queryFn: async () => {
      const response = await fetch(`${platformApiUrl}/v1/plans`);
      if (!response.ok) throw new Error(response.statusText);
      return ((await response.json()) as { plans?: PlanPriceRow[] }).plans ?? [];
    },
    staleTime: 60_000,
  });
  return prices.data ? withPrices(prices.data) : PLANS;
}
