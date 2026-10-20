// Plan catalog for pricing, checkout and billing screens.
// Prices are per seat per month, in USD. Annual prices are the monthly equivalent when billed yearly.
// Signet staff set the live prices in the admin app (Plans & billing); the prices below are only the
// fallback used when the API can't be reached. Server pages load live prices with getLivePlans
// (lib/plan-prices.ts); client components read them with usePlans or useLivePlans (components/marketing/plans-context.tsx).

export type BillingCycle = "monthly" | "annual";
export type PlanId = "starter" | "business" | "premium" | "enterprise";

export type Plan = {
  id: PlanId;
  name: string;
  audience: string;
  price: { monthly: number; annual: number } | null;
  highlight?: string;
  cta: string;
  includesLabel: string;
  features: string[];
};

export const MAX_ONLINE_SEATS = 10;

// Every feature listed here is shipped. Planned work lives in ROADMAP and is never sold as part of a plan.
export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    audience: "Individuals who send and sign their own agreements.",
    price: { monthly: 12, annual: 9 },
    cta: "Choose Starter",
    includesLabel: "Core features",
    features: ["Send for signature or sign yourself", "Signature, initials, date, text and checkbox fields", "Type, draw or upload your signature", "Signing order with signer, approver and CC roles", "Automatic reminders and expiration dates", "Audit trail & completion certificate"],
  },
  {
    id: "business",
    name: "Business",
    audience: "Teams sharing documents, templates and workflows.",
    price: { monthly: 24, annual: 18 },
    highlight: "Most popular",
    cta: "Choose Business",
    includesLabel: "Everything in Starter, plus",
    features: ["Teams, groups and member roles", "Shared folders and templates", "Signer passcodes", "Dropdown, radio and file-upload fields", "Signing links and post-signing redirects", "Your logo and colors on recipient emails"],
  },
  {
    id: "premium",
    name: "Premium",
    audience: "Teams handling sensitive or confidential documents.",
    price: { monthly: 40, annual: 30 },
    cta: "Choose Premium",
    includesLabel: "Everything in Business, plus",
    features: ["PDF encryption vault", "Password versioning and rotation", "Verify encrypted documents", "Remove Signet branding from emails", "Priority support"],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    audience: "Organizations that need documents on their own infrastructure.",
    price: null,
    cta: "Contact sales",
    includesLabel: "Everything in Premium, plus",
    features: ["Bring your own storage (AWS S3, Cloudflare R2, S3-compatible)", "Encrypted storage credentials", "Volume pricing beyond 10 seats", "Custom contract & invoicing", "Dedicated onboarding"],
  },
];

/** A plan's list price from the API, in US cents. Null prices mean "contact sales". */
export type PlanPriceRow = { plan: string; monthlyCents: number | null; annualCents: number | null };

/** The catalog with prices from the API; plans the API doesn't list keep their built-in price. */
export function withPrices(rows: PlanPriceRow[]): Plan[] {
  return PLANS.map((plan) => {
    const row = rows.find((item) => item.plan === plan.id);
    if (!row) return plan;
    const price = row.monthlyCents === null || row.annualCents === null ? null : { monthly: row.monthlyCents / 100, annual: row.annualCents / 100 };
    return { ...plan, price };
  });
}

export function getPlan(id: string, plans: Plan[] = PLANS): Plan | undefined {
  return plans.find((plan) => plan.id === id);
}

export function seatPrice(plan: Plan, cycle: BillingCycle) {
  return plan.price ? plan.price[cycle] : 0;
}

// Amount charged today for the chosen cycle (one month, or twelve months up front).
export function cycleTotal(plan: Plan, cycle: BillingCycle, seats: number) {
  return seatPrice(plan, cycle) * seats * (cycle === "annual" ? 12 : 1);
}

export function annualSavings(plan: Plan, seats: number) {
  if (!plan.price) return 0;
  return (plan.price.monthly - plan.price.annual) * seats * 12;
}

export function maxAnnualDiscount(plans: Plan[] = PLANS) {
  const discounts = plans.filter((plan) => plan.price && plan.price.monthly > 0).map((plan) => Math.round((1 - plan.price!.annual / plan.price!.monthly) * 100));
  return discounts.length ? Math.max(...discounts) : 0;
}

export function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);
}

type Availability = boolean | string;
export type ComparisonGroup = { title: string; rows: { label: string; values: Record<PlanId, Availability> }[] };

const row = (label: string, starter: Availability, business: Availability, premium: Availability, enterprise: Availability) => ({ label, values: { starter, business, premium, enterprise } });
const all = (label: string) => row(label, true, true, true, true);
const fromBusiness = (label: string) => row(label, false, true, true, true);
const fromPremium = (label: string) => row(label, false, false, true, true);
const enterpriseOnly = (label: string) => row(label, false, false, false, true);

export const COMPARISON: ComparisonGroup[] = [
  {
    title: "Sending & signing",
    rows: [
      all("Send documents for signature"),
      all("Sign documents yourself"),
      all("Multiple documents per envelope"),
      all("Signing order (sequential or parallel)"),
      all("Signer, approver, CC and viewer roles"),
      all("Delivery by email"),
      fromBusiness("Delivery by signing link"),
      all("Send reminders to pending signers"),
      all("Automatic reminders on a schedule you set"),
      all("Document expiration dates"),
      all("Email alerts when recipients view or sign"),
      fromBusiness("Redirect signers to your website after signing"),
      all("Custom email subject and message"),
      all("Signers can decline; senders can void"),
      all("Inbox for documents sent to you"),
    ],
  },
  {
    title: "Fields & signatures",
    rows: [
      all("Signature, initials, name, date, text and checkbox fields"),
      fromBusiness("Dropdown and radio fields"),
      fromBusiness("File-upload fields for signers"),
      fromBusiness("Attachments on envelopes"),
      all("Type, draw or upload signatures"),
      all("Saved signature for reuse"),
    ],
  },
  {
    title: "Organize & collaborate",
    rows: [
      row("Templates", "Personal", "Shared", "Shared", "Shared"),
      all("Duplicate envelopes"),
      fromBusiness("Shared folders"),
      fromBusiness("Bulk move, delete and void"),
      fromBusiness("Teams and groups"),
      fromBusiness("Member roles (owner, admin, member, viewer)"),
    ],
  },
  {
    title: "Branding",
    rows: [
      fromBusiness("Your logo, name and color on recipient emails"),
      fromPremium("Remove Signet branding from emails"),
    ],
  },
  {
    title: "Security & data",
    rows: [
      all("Audit trail for every envelope"),
      all("Completion certificate"),
      all("Unique, single-purpose signing links"),
      fromBusiness("Signer passcode with lockout after failed attempts"),
      fromPremium("PDF encryption vault (encrypt, decrypt, verify)"),
      fromPremium("PDF password versioning and rotation"),
      enterpriseOnly("Bring your own storage (AWS S3, Cloudflare R2, S3-compatible)"),
      enterpriseOnly("Encrypted storage credentials and connection testing"),
    ],
  },
  {
    title: "Support",
    rows: [row("Support", "Email", "Email", "Priority", "Dedicated onboarding")],
  },
];

// Planned, not shipped. Shown separately on the pricing page and not included in any plan.
export const ROADMAP = ["Bulk send from CSV", "Two-factor authentication", "SAML SSO & SCIM", "API & webhooks", "AI agreement builder"];

export const FAQS = [
  { q: "How are seats billed?", a: "Each seat is one member who prepares and sends documents. Recipients who only sign never need a seat or an account." },
  { q: "Do recipients need an account to sign?", a: "No. Each recipient gets a unique, single-purpose signing link by email, or a signing link you share yourself on Business and above." },
  { q: "Where are my documents stored?", a: "By default in Signet's secure object storage. On Enterprise you can connect your own AWS S3, Cloudflare R2 or S3-compatible bucket so documents stay in infrastructure you control." },
  { q: "Can I change seats or plans later?", a: "Yes. Contact us and we'll adjust your subscription. Added seats are charged on a prorated basis for the rest of your billing period." },
  { q: "Will my subscription renew automatically?", a: "Yes. Monthly plans renew each month and annual plans each year until you cancel." },
  { q: "Do you offer volume or non-profit discounts?", a: `Online checkout supports up to ${MAX_ONLINE_SEATS} seats. For larger teams, non-profits or custom terms, talk to our sales team.` },
  { q: "Are taxes included?", a: "Prices exclude taxes. Applicable taxes are calculated at payment based on your billing address." },
];

export const COMPANY_SIZES = ["Just me", "2–10", "11–50", "51–200", "201–1,000", "1,000+"];
