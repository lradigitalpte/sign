import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type EmptyStateProps = React.ComponentProps<"div"> & {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
};

function EmptyState({
  action,
  className,
  description,
  icon: Icon,
  secondaryAction,
  title,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed bg-surface-subtle px-6 py-12 text-center",
        className,
      )}
      data-slot="empty-state"
      {...props}
    >
      <div className="grid size-12 place-items-center rounded-2xl border bg-background text-muted-foreground shadow-xs">
        <Icon aria-hidden="true" className="size-5" />
      </div>
      <h3 className="mt-5 text-base font-semibold tracking-[-0.02em]">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      {action || secondaryAction ? (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}

export { EmptyState };
