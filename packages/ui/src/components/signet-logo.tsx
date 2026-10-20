import { cn } from "../lib/utils";

/** Signet mark: a document with a check. Inherits color from `currentColor`. */
export function SignetLogoIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={cn("size-6 text-primary", className)} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M6 3.5h7l5 5V20.5H6z" strokeLinejoin="round" />
      <path d="M13 3.5v5h5M8.7 15.2l1.8 1.8 4.8-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
