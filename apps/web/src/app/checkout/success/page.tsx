import { redirect } from "next/navigation";

// Stripe Checkout returns buyers to Billing, which confirms the plan once Stripe's webhook arrives.
// This address stays for old links.
export default function CheckoutSuccessPage() {
  redirect("/settings/billing?checkout=success");
}
