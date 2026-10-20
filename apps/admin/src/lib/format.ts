const dateFormat = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const numberFormat = new Intl.NumberFormat();

export const formatDate = (value: string) => dateFormat.format(new Date(value));
export const formatDateTime = (value: string) => dateTimeFormat.format(new Date(value));
export const formatNumber = (value: number) => numberFormat.format(value);

const units: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

export function formatRelative(value: string) {
  const seconds = (new Date(value).getTime() - Date.now()) / 1000;
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return relativeFormat.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

export const roleLabels: Record<string, string> = {
  super_admin: "Super admin",
  support: "Support",
  read_only: "Read only",
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

export const envelopeStatusLabels: Record<string, string> = {
  draft: "Draft",
  in_progress: "In progress",
  completed: "Completed",
  voided: "Voided",
  expired: "Expired",
};

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/** A length of time as its two largest units, e.g. "3d 4h" or "12m 5s". */
export function formatDuration(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const parts: [number, string][] = [
    [Math.floor(s / 86400), "d"],
    [Math.floor((s % 86400) / 3600), "h"],
    [Math.floor((s % 3600) / 60), "m"],
    [s % 60, "s"],
  ];
  const first = parts.findIndex(([value]) => value > 0);
  if (first === -1) return "0s";
  return parts
    .slice(first, first + 2)
    .filter(([value]) => value > 0)
    .map(([value, unit]) => `${value}${unit}`)
    .join(" ");
}

const moneyFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const wholeMoneyFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** US cents as dollars; whole amounts drop the cents ("$18", "$18.50"). */
export function formatMoney(cents: number) {
  return cents % 100 === 0 ? wholeMoneyFormat.format(cents / 100) : moneyFormat.format(cents / 100);
}

/** Large amounts rounded for headline figures: "$1,240", "$12.4K", "$1.2M". */
export function formatMoneyCompact(cents: number) {
  const dollars = cents / 100;
  if (Math.abs(dollars) < 10_000) return wholeMoneyFormat.format(Math.round(dollars));
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(dollars);
}

export const planLabels: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  business: "Business",
  premium: "Premium",
  enterprise: "Enterprise",
};

export const subscriptionStatusLabels: Record<string, string> = {
  trialing: "Trial",
  active: "Active",
  past_due: "Past due",
  canceled: "Canceled",
};
