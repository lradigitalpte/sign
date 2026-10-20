"use client";

import { CircleAlert, Info, Trash2, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useAccountDeletion, useAnnouncements, useMe, useWorkspaceDeletion } from "@/hooks/use-envelope-api";
import type { Announcement } from "@/lib/platform-api";
import { cn } from "@/lib/utils";

const DISMISSED_KEY = "signet:dismissed-announcements";

const STYLES: Record<Announcement["severity"], { icon: typeof Info; className: string }> = {
  info: { icon: Info, className: "border-blue-500/30 bg-blue-500/10 text-blue-900 dark:text-blue-100" },
  warning: { icon: TriangleAlert, className: "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-100" },
  critical: { icon: CircleAlert, className: "border-red-500/30 bg-red-500/10 text-red-900 dark:text-red-100" },
};

function readDismissed(): string[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(DISMISSED_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

const longDate = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long", day: "numeric" });

/** Signet announcements and a scheduled-deletion warning, shown above every workspace page. */
export function WorkspaceBanners() {
  const announcements = useAnnouncements();
  const deletion = useWorkspaceDeletion();
  const accountDeletion = useAccountDeletion().data?.request;
  const me = useMe();
  const [dismissed, setDismissed] = useState<string[]>(() => (typeof window === "undefined" ? [] : readDismissed()));

  const dismiss = (id: string) => {
    const next = [...dismissed, id].slice(-50);
    setDismissed(next);
    try {
      window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
    } catch {
      // Private mode or blocked storage: the banner just comes back next visit.
    }
  };

  const visible = (announcements.data ?? []).filter((a) => a.severity === "critical" || !dismissed.includes(a.id));
  const pending = deletion.data?.request;
  if (!visible.length && !pending && !accountDeletion) return null;

  return (
    <div className="shrink-0 space-y-px">
      {accountDeletion ? (
        <div role="alert" className="flex items-center gap-2 border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-900 dark:text-red-100 sm:px-5">
          <Trash2 className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1">
            <strong>Your account will be deleted on {longDate.format(new Date(accountDeletion.scheduledFor))}.</strong>
          </span>
          <Link href="/settings/profile" className="shrink-0 font-semibold underline underline-offset-2">
            Keep my account
          </Link>
        </div>
      ) : null}
      {pending ? (
        <div role="alert" className="flex items-center gap-2 border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-900 dark:text-red-100 sm:px-5">
          <Trash2 className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1">
            <strong>This workspace will be permanently deleted on {longDate.format(new Date(pending.scheduledFor))}</strong>, with all its documents. Requested by {pending.requestedByEmail}.
          </span>
          {me.data?.workspace.role === "owner" ? (
            <Link href="/settings/data" className="shrink-0 font-semibold underline underline-offset-2">
              Cancel deletion
            </Link>
          ) : null}
        </div>
      ) : null}
      {visible.map((announcement) => {
        const style = STYLES[announcement.severity];
        const Icon = style.icon;
        return (
          <div key={announcement.id} role={announcement.severity === "critical" ? "alert" : "status"} className={cn("flex items-center gap-2 border-b px-4 py-2 text-xs sm:px-5", style.className)}>
            <Icon className="size-3.5 shrink-0" />
            <p className="min-w-0 flex-1">
              <strong>{announcement.title}</strong>
              {announcement.body ? <span className="opacity-90"> {announcement.body}</span> : null}
              {announcement.linkUrl ? (
                <a href={announcement.linkUrl} target="_blank" rel="noreferrer" className="ms-1 font-semibold underline underline-offset-2">
                  {announcement.linkLabel ?? "Learn more"}
                </a>
              ) : null}
            </p>
            {announcement.severity === "critical" ? null : (
              <button type="button" aria-label="Dismiss" onClick={() => dismiss(announcement.id)} className="grid size-6 shrink-0 place-items-center rounded-md opacity-70 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10">
                <X className="size-3.5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
