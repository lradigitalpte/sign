"use client";

import {
  Ban,
  CheckCircle2,
  Eye,
  FileCheck,
  FilePenLine,
  History,
  Mail,
  Send,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { StatusBadge } from "@/components/shared/status-badge";
import {
  auditActor,
  auditEventTone,
  formatAuditIp,
  groupAuditEvents,
  shortHash,
  type GroupedAuditEvent,
} from "@/lib/audit-events";
import type { AuditEvent } from "@/lib/platform-api";
import { cn } from "@/lib/utils";

const EVENT_ICONS: Record<string, LucideIcon> = {
  "envelope.sent": Send,
  "envelope.viewed": Eye,
  "envelope.completed": ShieldCheck,
  "envelope.voided": Ban,
  "envelope.reminded": Mail,
  "recipient.completed": FilePenLine,
  "recipient.approved": CheckCircle2,
  "recipient.declined": Ban,
  "document.finalized": FileCheck,
};

function eventIcon(eventType: string): LucideIcon {
  if (EVENT_ICONS[eventType]) {
    return EVENT_ICONS[eventType];
  }
  if (eventType.endsWith(".delivered")) {
    return Mail;
  }
  if (eventType.endsWith(".failed")) {
    return Ban;
  }
  return History;
}

const TONE_STYLES = {
  neutral: "border-border text-muted-foreground",
  info: "border-info/30 bg-info/5 text-info-foreground",
  success: "border-success/30 bg-success/5 text-success-foreground",
  warning: "border-warning/30 bg-warning/5 text-warning-foreground",
  danger: "border-destructive/30 bg-destructive/5 text-destructive",
} as const;

function formatWhen(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function eventTypeKey(eventType: string) {
  const [scope, action] = eventType.split(".");
  if (!scope || !action) {
    return null;
  }
  return `eventTypes.${scope}.${action}` as const;
}

function EventTitle({ event }: { event: GroupedAuditEvent }) {
  const t = useTranslations("AuditTrail");

  if (event.eventType === "document.finalized" && event.count > 1) {
    return <>{t("groupedFinalized", { count: event.count })}</>;
  }
  if (event.eventType === "envelope.viewed" && event.count > 1) {
    return <>{t("groupedViewed", { count: event.count })}</>;
  }

  const key = eventTypeKey(event.eventType);
  if (key) {
    return <>{t(key)}</>;
  }
  return <>{event.eventType.replaceAll(".", " · ")}</>;
}

function EventDetails({ event }: { event: GroupedAuditEvent }) {
  const t = useTranslations("AuditTrail");
  const ip = formatAuditIp(event.ipAddress);
  const sha = shortHash(event.metadata.sha256);
  const invitations = typeof event.metadata.invitations === "number" ? event.metadata.invitations : null;

  return (
    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
      {!ip && event.ipAddress ? (
        <span className="rounded-full bg-muted px-2 py-0.5">{t("localSession")}</span>
      ) : null}
      {ip ? <span className="rounded-full bg-muted px-2 py-0.5 font-mono">{ip}</span> : null}
      {invitations !== null ? (
        <span className="rounded-full bg-muted px-2 py-0.5">
          {t("invitationsSent", { count: invitations })}
        </span>
      ) : null}
      {sha ? (
        <span className="rounded-full bg-muted px-2 py-0.5 font-mono" title={String(event.metadata.sha256)}>
          SHA-256 {sha}
        </span>
      ) : null}
    </div>
  );
}

function TimelineItem({
  event,
  isLast,
  locale,
}: {
  event: GroupedAuditEvent;
  isLast: boolean;
  locale: string;
}) {
  const t = useTranslations("AuditTrail");
  const tone = auditEventTone(event.eventType);
  const Icon = eventIcon(event.eventType);

  return (
    <li className="relative flex gap-4">
      <div className="flex w-9 shrink-0 flex-col items-center">
        <div
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-full border-2 bg-background shadow-xs",
            TONE_STYLES[tone],
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </div>
        {!isLast ? <div className="my-1 w-px flex-1 bg-border" aria-hidden="true" /> : null}
      </div>

      <article className={cn("min-w-0 flex-1", isLast ? "pb-0" : "pb-6")}>
        <div className="rounded-2xl border bg-background p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold leading-5">
                <EventTitle event={event} />
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {auditActor(event) === "System" ? t("systemActor") : auditActor(event)}
              </p>
            </div>
            <time className="shrink-0 text-xs tabular-nums text-muted-foreground" dateTime={event.occurredAt}>
              {formatWhen(event.occurredAt, locale)}
            </time>
          </div>
          <EventDetails event={event} />
          {event.count > 1 && event.firstOccurredAt !== event.occurredAt ? (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {t("firstSeen", { when: formatWhen(event.firstOccurredAt, locale) })}
            </p>
          ) : null}
        </div>
      </article>
    </li>
  );
}

export function AuditTrailTimeline({ events, locale }: { events: AuditEvent[]; locale: string }) {
  const t = useTranslations("AuditTrail");
  const grouped = groupAuditEvents(events);
  const latest = grouped[grouped.length - 1];

  return (
    <div className="mt-8 space-y-6">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border bg-background p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("summaryEvents")}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{events.length}</p>
          </div>
          <div className="rounded-2xl border bg-background p-4 shadow-sm sm:col-span-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("summaryLatest")}</p>
            <p className="mt-1 text-sm font-medium">
              {latest ? formatWhen(latest.occurredAt, locale) : "—"}
            </p>
          </div>
        </div>
        <StatusBadge tone="success" className="self-start">
          {t("verifiedChain")}
        </StatusBadge>
      </div>

      <ol className="relative m-0 list-none p-0">
        {grouped.map((event, index) => (
          <TimelineItem key={event.id} event={event} isLast={index === grouped.length - 1} locale={locale} />
        ))}
      </ol>

      <div className="flex items-start gap-2 rounded-2xl border border-dashed bg-muted/30 px-4 py-3 text-xs leading-5 text-muted-foreground">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
        <p>{t("description")}</p>
      </div>
    </div>
  );
}
