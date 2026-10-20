import { cn } from "@/lib/utils";

const COLOURS = [
  "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
];

/** A rounded tile with the name's first letter, coloured by the name so it stays the same everywhere. */
export function InitialBadge({ name, className }: { name: string; className?: string }) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return (
    <span aria-hidden className={cn("grid size-10 shrink-0 place-items-center rounded-xl text-sm font-bold", COLOURS[hash % COLOURS.length], className)}>
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
