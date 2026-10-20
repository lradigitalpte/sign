import { cn } from "@signet/ui/lib/utils";

const suspensionOptions = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
];

export function StatusFilter({ value, onChange, options = suspensionOptions, label = "Status" }: { value: string; onChange: (value: string) => void; options?: { value: string; label: string }[]; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-lg border bg-card p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "h-8 shrink-0 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors",
            value === option.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
