import { cn } from "@signet/ui/lib/utils";

// Soft tints picked by name so the same workspace or person always gets the same color.
const tints = [
  "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
];

function tintFor(seed: string) {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return tints[hash % tints.length];
}

/** "Henry's Workspace" → "HW", "Henry" → "H". Apostrophes are dropped so possessives don't split a word. */
export function initials(name: string) {
  const parts = name.replace(/['’]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0]?.[0] ?? "?")).toUpperCase();
}

/** Initials in a tinted tile: rounded square for workspaces, circle for people. */
export function InitialAvatar({ name, seed = name, shape = "circle", size = "md", className }: { name: string; seed?: string; shape?: "circle" | "square"; size?: "sm" | "md" | "lg"; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center font-semibold",
        shape === "circle" ? "rounded-full" : "rounded-xl",
        size === "sm" && "size-8 text-[11px]",
        size === "md" && "size-10 text-xs",
        size === "lg" && "size-14 text-base",
        tintFor(seed),
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

/** Personal workspaces are created automatically for each user; their slug is "personal-<id>". */
export const isPersonalWorkspace = (slug: string) => slug.startsWith("personal-");
