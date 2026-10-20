import { PLANS, withPrices, type Plan, type PlanPriceRow } from "@/lib/plans";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8085";

/**
 * The plan catalog with the list prices Signet staff set in the admin app. Cached for a minute, so a
 * price change reaches the pricing and checkout pages within that time. If the API can't be reached
 * the built-in prices are used, so the pages never break. For server components only.
 */
export async function getLivePlans(): Promise<Plan[]> {
  try {
    const response = await fetch(`${apiUrl}/v1/plans`, { next: { revalidate: 60 } });
    if (!response.ok) return PLANS;
    const body = (await response.json()) as { plans?: PlanPriceRow[] };
    return withPrices(body.plans ?? []);
  } catch {
    return PLANS;
  }
}
