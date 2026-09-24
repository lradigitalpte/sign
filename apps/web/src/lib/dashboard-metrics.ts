import type { Envelope, InboxItem } from "@/lib/platform-api";

export type DashboardMetrics = {
  actionRequired: number;
  drafts: number;
  inProgress: number;
  completedThisMonth: number;
  total: number;
  members: number;
};

function isThisMonth(iso: string, now = new Date()) {
  const date = new Date(iso);
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

export function buildDashboardMetrics(
  envelopes: Envelope[],
  pendingInbox: InboxItem[],
  memberCount: number,
): DashboardMetrics {
  return {
    actionRequired: pendingInbox.length,
    drafts: envelopes.filter((item) => item.status === "draft").length,
    inProgress: envelopes.filter((item) => item.status === "in_progress").length,
    completedThisMonth: envelopes.filter((item) => item.status === "completed" && isThisMonth(item.updatedAt)).length,
    total: envelopes.length,
    members: memberCount,
  };
}

export function sortByRecent<T extends { updatedAt: string }>(items: T[]) {
  return [...items].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function relativeUpdatedLabel(iso: string, locale: string) {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (minutes < 60) {
    return formatter.format(-Math.max(1, minutes), "minute");
  }
  if (hours < 24) {
    return formatter.format(-hours, "hour");
  }
  if (days < 7) {
    return formatter.format(-days, "day");
  }
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}
