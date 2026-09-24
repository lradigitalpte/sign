"use client";

import { SIGNATURE_FONTS } from "@/lib/signature-fonts";
import { cn } from "@/lib/utils";

export function SignatureFontPicker({
  value,
  onChange,
  compact = false,
}: {
  value: string;
  onChange: (fontId: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", compact ? "gap-1.5" : "gap-2")}>
      {/* Keep every script face in the bundle so switching styles updates immediately. */}
      <span className="sr-only" aria-hidden>
        {SIGNATURE_FONTS.map((item) => (
          <span key={item.id} className={item.font.className} />
        ))}
      </span>
      {SIGNATURE_FONTS.map((item) => {
        const selected = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(item.id)}
            className={cn(
              "rounded-xl border bg-background transition",
              compact ? "min-w-[4.5rem] px-2 py-1" : "min-w-[5.5rem] px-3 py-2",
              selected ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:border-primary/40",
            )}
          >
            <span
              className={cn(
                item.font.className,
                "block leading-none text-foreground",
                compact ? "text-lg" : "text-2xl",
              )}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
