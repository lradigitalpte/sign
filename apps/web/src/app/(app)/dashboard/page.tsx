"use client";

import { ArrowUpRight, CheckCircle2, Clock3, FileText, Loader2, Plus, Send, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { useEnvelopes, useInbox, useMe, useMembers } from "@/hooks/use-envelope-api";
import { buildDashboardMetrics, relativeUpdatedLabel, sortByRecent } from "@/lib/dashboard-metrics";
import type { Envelope } from "@/lib/platform-api";
import { cn } from "@/lib/utils";

const statusTone = {
  draft: "neutral",
  in_progress: "warning",
  completed: "success",
  voided: "danger",
  expired: "danger",
} as const;

export default function DashboardPage() {
  const locale = useLocale();
  const t = useTranslations("Dashboard");
  const tEnv = useTranslations("Envelopes");
  const meQuery = useMe();
  const envelopesQuery = useEnvelopes();
  const inboxQuery = useInbox();
  const membersQuery = useMembers();

  const envelopes = envelopesQuery.data ?? [];
  const inbox = inboxQuery.data ?? [];
  const pendingInbox = useMemo(() => inbox.filter((item) => item.status === "sent" || item.status === "viewed"), [inbox]);
  const loading = envelopesQuery.isLoading || inboxQuery.isLoading;

  const metrics = useMemo(
    () => buildDashboardMetrics(envelopes, pendingInbox, membersQuery.data?.length ?? 0),
    [envelopes, membersQuery.data?.length, pendingInbox],
  );

  const recentEnvelopes = useMemo(() => sortByRecent(envelopes).slice(0, 8), [envelopes]);

  const statCards = [
    { key: "actionRequired", value: metrics.actionRequired, icon: Clock3, tone: "bg-warning/15 text-warning-foreground", href: "/inbox" },
    { key: "inProgress", value: metrics.inProgress, icon: Send, tone: "bg-info/15 text-info-foreground", href: "/envelopes?filter.status=in_progress" },
    { key: "completed", value: metrics.completedThisMonth, icon: CheckCircle2, tone: "bg-success/15 text-success-foreground", href: "/envelopes?filter.status=completed" },
    { key: "members", value: metrics.members, icon: Users, tone: "bg-primary/10 text-primary", href: "/members" },
  ] as const;

  return (
    <main className="mx-auto w-full max-w-[1440px] px-3 py-8 sm:px-5 lg:px-8 lg:py-10">
      <PageHeader
        actions={
          <Button asChild>
            <Link href="/envelopes/new">
              <Plus />
              {t("newEnvelope")}
            </Link>
          </Button>
        }
        description={t("description")}
        eyebrow={meQuery.data?.workspace.name ?? "Workspace"}
        title={t("title")}
      />

      <section aria-label={t("summary")} className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map(({ href, icon: Icon, key, tone, value }) => (
          <Link key={key} href={href} className="group">
            <article className="clay-panel-soft h-full rounded-3xl p-5 transition hover:border-primary/20 hover:shadow-md">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t(`stats.${key}`)}</p>
                  <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]">{loading ? "—" : value}</p>
                </div>
                <span className={cn("grid size-10 place-items-center rounded-2xl transition group-hover:scale-105", tone)}>
                  <Icon className="size-4.5" />
                </span>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{t(`stats.${key}Hint`)}</p>
            </article>
          </Link>
        ))}
      </section>

      <section className="clay-panel-soft mt-6 rounded-3xl p-5 sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.025em]">{t("recentTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("recentDescription")}</p>
          </div>
          <Button asChild variant="ghost">
            <Link href="/envelopes">
              {t("viewAll")}
              <ArrowUpRight />
            </Link>
          </Button>
        </div>
        {envelopesQuery.isLoading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {tEnv("loading")}
          </div>
        ) : recentEnvelopes.length === 0 ? (
          <p className="py-10 text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="mt-2 divide-y">
            {recentEnvelopes.map((item) => (
              <RecentRow key={item.id} item={item} updatedLabel={relativeUpdatedLabel(item.updatedAt, locale)} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function RecentRow({ item, updatedLabel }: { item: Envelope; updatedLabel: string }) {
  const t = useTranslations("Envelopes");
  return (
    <Link href={`/envelopes/${item.id}`} className="group flex items-center gap-4 py-4 first:pt-2 last:pb-0">
      <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
        <FileText className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold transition group-hover:text-primary">{item.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{updatedLabel}</p>
      </div>
      <StatusBadge tone={statusTone[item.status]}>{t(`statuses.${item.status}`)}</StatusBadge>
    </Link>
  );
}
