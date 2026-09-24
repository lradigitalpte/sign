import type { AuditEvent } from "@/lib/platform-api";

export type GroupedAuditEvent = AuditEvent & {
  count: number;
  firstOccurredAt: string;
};

const COLLAPSIBLE_TYPES = new Set(["document.finalized", "envelope.viewed"]);

export function groupAuditEvents(events: AuditEvent[]): GroupedAuditEvent[] {
  const grouped: GroupedAuditEvent[] = [];
  for (const event of events) {
    const previous = grouped[grouped.length - 1];
    if (previous && previous.eventType === event.eventType && COLLAPSIBLE_TYPES.has(event.eventType)) {
      previous.count += 1;
      previous.occurredAt = event.occurredAt;
      previous.metadata = event.metadata;
      continue;
    }
    grouped.push({ ...event, count: 1, firstOccurredAt: event.occurredAt });
  }
  return grouped;
}

export function auditActor(event: Pick<GroupedAuditEvent, "actorName" | "recipientName">) {
  return event.actorName ?? event.recipientName ?? "System";
}

export function formatAuditIp(ip?: string) {
  if (!ip || ip === "::1" || ip === "127.0.0.1") {
    return null;
  }
  return ip;
}

export function shortHash(value: unknown) {
  if (typeof value !== "string" || value.length < 12) {
    return null;
  }
  return `${value.slice(0, 8)}…${value.slice(-8)}`;
}

export type AuditTone = "neutral" | "info" | "success" | "warning" | "danger";

export function auditEventTone(eventType: string): AuditTone {
  if (eventType.endsWith(".failed") || eventType.includes("declined") || eventType.includes("voided")) {
    return "danger";
  }
  if (eventType.includes("completed") || eventType.endsWith(".delivered")) {
    return "success";
  }
  if (eventType.includes("viewed") || eventType.includes("sent") || eventType.includes("reminded")) {
    return "info";
  }
  if (eventType.includes("finalized")) {
    return "neutral";
  }
  return "neutral";
}
