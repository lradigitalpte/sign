import type { LucideIcon } from "lucide-react";

type AuthMessageProps = { icon: LucideIcon; title: string; description: string };

export function AuthMessage({ description, icon: Icon, title }: AuthMessageProps) {
  return <div className="rounded-2xl border bg-background/70 p-5 text-center"><span className="mx-auto grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary"><Icon className="size-5" /></span><h2 className="mt-4 font-semibold">{title}</h2><p className="mt-1.5 text-sm leading-6 text-muted-foreground">{description}</p></div>;
}
