import { SignetLogoIcon } from "@signet/ui/components/signet-logo";

import { cn } from "@/lib/utils";

export { SignetLogoIcon };

/** Logo lockup used in the public header and footer */
export function SignetWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5 text-[1.05rem] font-semibold tracking-tight", className)}>
      <span className="grid size-9 place-items-center rounded-xl bg-linear-to-br from-(--site-accent) to-(--site-accent-hover) shadow-md shadow-(--site-accent)/30 ring-1 ring-white/20">
        <SignetLogoIcon className="size-5 text-white" />
      </span>
      Signet
    </span>
  );
}

export type SiteNavLink = { label: string; href: string; description: string };

export const PRODUCT_LINKS: SiteNavLink[] = [
  { label: "Features", href: "/features", description: "Fields, roles, reminders, and signing order" },
  { label: "How it works", href: "/features#workflow", description: "From upload to signed in three steps" },
  { label: "Security", href: "/security", description: "Recipient links, roles, and audit trail" },
  { label: "Compare plans", href: "/pricing#compare", description: "Every feature, side by side" },
];

export const SOLUTION_LINKS: SiteNavLink[] = [
  { label: "Sales", href: "/solutions#sales", description: "Proposals and contracts, approved to signed" },
  { label: "People operations", href: "/solutions#people", description: "Offers and onboarding for every hire" },
  { label: "Legal", href: "/solutions#legal", description: "Templates and roles for repeat agreements" },
  { label: "Client services", href: "/solutions#clients", description: "Clients sign on any device, no account" },
];

export const COMPANY_LINKS: { label: string; href: string }[] = [
  { label: "Contact", href: "/contact" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
];
