import { cva, type VariantProps } from "class-variance-authority";
import { Circle } from "lucide-react";

import { cn } from "@/lib/utils";

const statusBadgeVariants = cva(
  "inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold tracking-[-0.01em]",
  {
    variants: {
      tone: {
        neutral: "border-border bg-muted text-muted-foreground",
        info: "border-info/20 bg-info/10 text-info-foreground",
        success: "border-success/20 bg-success/10 text-success-foreground",
        warning: "border-warning/25 bg-warning/10 text-warning-foreground",
        danger: "border-destructive/20 bg-destructive/10 text-destructive",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  },
);

type StatusBadgeProps = React.ComponentProps<"span"> &
  VariantProps<typeof statusBadgeVariants> & {
    dot?: boolean;
  };

function StatusBadge({
  children,
  className,
  dot = true,
  tone,
  ...props
}: StatusBadgeProps) {
  return (
    <span
      className={cn(statusBadgeVariants({ tone }), className)}
      data-slot="status-badge"
      {...props}
    >
      {dot ? <Circle aria-hidden="true" className="size-1.5 fill-current" /> : null}
      {children}
    </span>
  );
}

export { StatusBadge, statusBadgeVariants };
