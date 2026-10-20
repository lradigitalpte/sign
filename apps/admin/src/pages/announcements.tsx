import { CircleAlert, Info, LoaderCircle, Pencil, Plus, Square, TriangleAlert } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "@signet/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@signet/ui/components/dialog";
import { Input } from "@signet/ui/components/input";
import { Label } from "@signet/ui/components/label";
import { Textarea } from "@signet/ui/components/textarea";
import { cn } from "@signet/ui/lib/utils";

import { Notice } from "@/components/action-dialog";
import { useCan } from "@/lib/admin-context";
import { Badge, Card, EmptyState, ErrorState, Loading, PageHeader } from "@/components/page";
import { useAdminAction, useAnnouncements } from "@/lib/api";
import { formatDateTime, formatRelative, planLabels } from "@/lib/format";
import type { Announcement, PlanId } from "@/lib/types";

const severities = {
  info: { label: "Info", icon: Info, className: "border-blue-500/30 bg-blue-500/10 text-blue-900 dark:text-blue-100" },
  warning: { label: "Warning", icon: TriangleAlert, className: "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-100" },
  critical: { label: "Critical", icon: CircleAlert, className: "border-red-500/30 bg-red-500/10 text-red-900 dark:text-red-100" },
} as const;

const plans: PlanId[] = ["free", "starter", "business", "premium", "enterprise"];

/** The banner as customers see it at the top of the app. */
function BannerPreview({ title, body, severity, linkLabel }: { title: string; body: string; severity: Announcement["severity"]; linkLabel?: string | null }) {
  const style = severities[severity];
  const Icon = style.icon;
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border px-4 py-3 text-sm", style.className)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">{title || "Title"}</span>
        {body ? <span className="opacity-90"> {body}</span> : null}
        {linkLabel ? <span className="ms-1 font-semibold underline underline-offset-2">{linkLabel}</span> : null}
      </p>
    </div>
  );
}

type Draft = { title: string; body: string; severity: Announcement["severity"]; plans: PlanId[]; linkUrl: string; linkLabel: string; startsAt: string; endsAt: string };

/** datetime-local value in the admin's time zone. */
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function draftFrom(a: Announcement | null): Draft {
  return a
    ? { title: a.title, body: a.body, severity: a.severity, plans: a.plans, linkUrl: a.linkUrl ?? "", linkLabel: a.linkLabel ?? "", startsAt: toLocalInput(a.startsAt), endsAt: toLocalInput(a.endsAt) }
    : { title: "", body: "", severity: "info", plans: [], linkUrl: "", linkLabel: "", startsAt: "", endsAt: "" };
}

function Editor({ announcement, onClose, onDone }: { announcement: Announcement | null; onClose: () => void; onDone: (message: string) => void }) {
  const [draft, setDraft] = useState(() => draftFrom(announcement));
  // Fixed when the editor opens, to tell "Publish" from "Schedule".
  const [openedAt] = useState(() => Date.now());
  const save = useAdminAction<Announcement>();
  const update = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));
  const togglePlan = (plan: PlanId) => update({ plans: draft.plans.includes(plan) ? draft.plans.filter((p) => p !== plan) : [...draft.plans, plan] });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const body = {
      title: draft.title,
      body: draft.body,
      severity: draft.severity,
      plans: draft.plans,
      linkUrl: draft.linkUrl,
      linkLabel: draft.linkLabel || (draft.linkUrl ? "Learn more" : ""),
      startsAt: draft.startsAt ? new Date(draft.startsAt).toISOString() : null,
      endsAt: draft.endsAt ? new Date(draft.endsAt).toISOString() : null,
    };
    save.mutate(announcement ? { method: "PUT", path: `/announcements/${announcement.id}`, body } : { method: "POST", path: "/announcements", body }, {
      onSuccess: (saved) => {
        onDone(saved.state === "scheduled" ? `Scheduled “${saved.title}” for ${formatDateTime(saved.startsAt)}.` : `“${saved.title}” is live.`);
        onClose();
      },
    });
  };

  return (
    <form onSubmit={submit} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      <DialogHeader>
        <DialogTitle>{announcement ? "Edit announcement" : "New announcement"}</DialogTitle>
        <DialogDescription>Shown as a banner at the top of the customer app. Info and warning banners can be dismissed; critical ones stay until they end.</DialogDescription>
      </DialogHeader>

      <BannerPreview title={draft.title} body={draft.body} severity={draft.severity} linkLabel={draft.linkUrl ? draft.linkLabel || "Learn more" : null} />

      <div className="grid gap-2">
        <Label htmlFor="announcement-title">Title</Label>
        <Input id="announcement-title" value={draft.title} onChange={(event) => update({ title: event.target.value })} maxLength={120} placeholder="Scheduled maintenance on Sunday" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="announcement-body">Message (optional)</Label>
        <Textarea id="announcement-body" value={draft.body} onChange={(event) => update({ body: event.target.value })} maxLength={600} rows={2} placeholder="Signing may be unavailable for up to 10 minutes from 02:00 UTC." />
      </div>
      <div className="grid gap-2">
        <Label>Type</Label>
        <div role="radiogroup" aria-label="Type" className="flex flex-wrap gap-1.5">
          {(Object.keys(severities) as Announcement["severity"][]).map((severity) => (
            <button
              key={severity}
              type="button"
              role="radio"
              aria-checked={draft.severity === severity}
              onClick={() => update({ severity })}
              className={cn("h-8 rounded-lg border px-3 text-sm font-medium", draft.severity === severity ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}
            >
              {severities[severity].label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-2">
        <Label>Who sees it</Label>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            aria-pressed={draft.plans.length === 0}
            onClick={() => update({ plans: [] })}
            className={cn("h-8 rounded-lg border px-3 text-sm font-medium", draft.plans.length === 0 ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}
          >
            Everyone
          </button>
          {plans.map((plan) => (
            <button
              key={plan}
              type="button"
              aria-pressed={draft.plans.includes(plan)}
              onClick={() => togglePlan(plan)}
              className={cn("h-8 rounded-lg border px-3 text-sm font-medium", draft.plans.includes(plan) ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}
            >
              {planLabels[plan]}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="announcement-link">Link (optional)</Label>
          <Input id="announcement-link" type="url" value={draft.linkUrl} onChange={(event) => update({ linkUrl: event.target.value })} placeholder="https://status.signet.app" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="announcement-link-label">Link text</Label>
          <Input id="announcement-link-label" value={draft.linkLabel} onChange={(event) => update({ linkLabel: event.target.value })} placeholder="Learn more" disabled={!draft.linkUrl} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="announcement-starts">Starts</Label>
          <Input id="announcement-starts" type="datetime-local" value={draft.startsAt} onChange={(event) => update({ startsAt: event.target.value })} />
          <p className="text-xs text-muted-foreground">Empty means now.</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="announcement-ends">Ends</Label>
          <Input id="announcement-ends" type="datetime-local" value={draft.endsAt} onChange={(event) => update({ endsAt: event.target.value })} />
          <p className="text-xs text-muted-foreground">Empty means until you end it.</p>
        </div>
      </div>

      {save.error ? (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          {save.error.message}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending || !draft.title.trim()}>
          {save.isPending ? <LoaderCircle className="animate-spin" /> : null}
          {announcement ? "Save" : draft.startsAt && new Date(draft.startsAt).getTime() > openedAt ? "Schedule" : "Publish"}
        </Button>
      </DialogFooter>
    </form>
  );
}

const stateBadge = { live: <Badge tone="success">Live</Badge>, scheduled: <Badge tone="info">Scheduled</Badge>, ended: <Badge>Ended</Badge> };

export function AnnouncementsPage() {
  const list = useAnnouncements();
  const canManage = useCan("super_admin");
  const end = useAdminAction();
  const [editing, setEditing] = useState<Announcement | null | "new">(null);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Announcements"
        description="Banners at the top of the customer app: maintenance, incidents, new features."
        actions={
          canManage ? (
            <Button size="sm" onClick={() => setEditing("new")}>
              <Plus /> New announcement
            </Button>
          ) : null
        }
      />
      <Notice message={notice} onDismiss={() => setNotice(null)} />

      {list.isPending ? (
        <Card>
          <Loading />
        </Card>
      ) : list.error ? (
        <Card>
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        </Card>
      ) : list.data.length === 0 ? (
        <Card>
          <EmptyState title="No announcements yet" description="Publish one to show a banner to every customer, or only to some plans." />
        </Card>
      ) : (
        <div className="space-y-3">
          {list.data.map((a) => (
            <Card key={a.id} className={cn("p-5", a.state === "ended" && "opacity-70")}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                <div className="min-w-0 flex-1">
                  <BannerPreview title={a.title} body={a.body} severity={a.severity} linkLabel={a.linkUrl ? a.linkLabel : null} />
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {stateBadge[a.state]}
                    <span>{a.plans.length ? `${a.plans.map((p) => planLabels[p]).join(", ")} plans` : "Everyone"}</span>
                    <span title={formatDateTime(a.startsAt)}>
                      {a.state === "scheduled" ? "Starts" : "Started"} {formatRelative(a.startsAt)}
                    </span>
                    {a.endsAt ? (
                      <span title={formatDateTime(a.endsAt)}>
                        {a.state === "ended" ? "Ended" : "Ends"} {formatRelative(a.endsAt)}
                      </span>
                    ) : null}
                    {a.createdBy ? <span>by {a.createdBy}</span> : null}
                  </div>
                </div>
                {canManage && a.state !== "ended" ? (
                  <div className="flex shrink-0 gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => setEditing(a)}>
                      <Pencil /> Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={end.isPending}
                      onClick={() => end.mutate({ method: "POST", path: `/announcements/${a.id}/end` }, { onSuccess: () => setNotice(`Ended “${a.title}”.`) })}
                    >
                      <Square /> End now
                    </Button>
                  </div>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          {editing !== null ? <Editor key={editing === "new" ? "new" : editing.id} announcement={editing === "new" ? null : editing} onClose={() => setEditing(null)} onDone={setNotice} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
