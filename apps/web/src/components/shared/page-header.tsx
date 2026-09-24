import type { ReactNode } from "react";

type PageHeaderProps = { eyebrow?: string; title: string; description?: string; actions?: ReactNode };

export function PageHeader({ actions, description, eyebrow, title }: PageHeaderProps) {
  return <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div>{eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{eyebrow}</p> : null}<h1 className="mt-1.5 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">{title}</h1>{description ? <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p> : null}</div>{actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}</div>;
}
