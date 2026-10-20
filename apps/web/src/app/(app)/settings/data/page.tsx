"use client";

import { AlertTriangle, Download, KeyRound, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useAllowSupportAccess,
  useCancelWorkspaceDeletion,
  useExportWorkspace,
  useMe,
  useRequestWorkspaceDeletion,
  useRevokeSupportAccess,
  useSupportAccess,
  useWorkspaceDeletion,
} from "@/hooks/use-envelope-api";
import { cn } from "@/lib/utils";

const DURATIONS = [
  { hours: 24, label: "24 hours" },
  { hours: 72, label: "3 days" },
  { hours: 168, label: "7 days" },
];

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const longDate = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long", day: "numeric" });

function Panel({ icon: Icon, title, description, danger, children }: { icon: typeof KeyRound; title: string; description: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <section className={cn("rounded-3xl border bg-card p-5 shadow-sm sm:p-6", danger && "border-destructive/30")}>
      <div className="flex items-start gap-3">
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", danger ? "bg-destructive/10 text-destructive" : "bg-surface-subtle text-muted-foreground")}>
          <Icon className="size-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function ErrorText({ error }: { error: Error | null }) {
  return error ? <p className="mt-3 text-sm text-destructive">{error.message}</p> : null;
}

function SupportAccessPanel() {
  const access = useSupportAccess();
  const allow = useAllowSupportAccess();
  const revoke = useRevokeSupportAccess();
  const [hours, setHours] = useState(72);
  const [note, setNote] = useState("");
  const current = access.data?.current;
  const history = (access.data?.history ?? []).filter((grant) => !grant.active).slice(0, 5);

  return (
    <Panel icon={KeyRound} title="Signet support access" description="Let Signet support open this workspace's documents while they help you. Read-only, for a limited time, and you can turn it off at any time.">
      {access.isLoading ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : current ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 sm:flex-row sm:items-center">
          <ShieldCheck className="size-5 shrink-0 text-emerald-600" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold">Support can open your documents until {dateTime.format(new Date(current.expiresAt))}</p>
            <p className="text-muted-foreground">
              Allowed by {current.grantedByName ?? "a workspace admin"}
              {current.note ? ` · “${current.note}”` : ""}. Each document they open is listed in that envelope&apos;s audit trail.
            </p>
          </div>
          <Button variant="outline" disabled={revoke.isPending} onClick={() => revoke.mutate()}>
            {revoke.isPending ? <Loader2 className="animate-spin" /> : null} Turn off now
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <ul className="grid gap-1.5 text-sm text-muted-foreground">
            <li>• Support can view documents and signed copies, but can&apos;t change, send or sign anything.</li>
            <li>• Every document they open shows up as “Signet support” in that envelope&apos;s audit trail.</li>
            <li>• Access ends by itself at the end of the period you choose.</li>
          </ul>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="How long">
            {DURATIONS.map((option) => (
              <button
                key={option.hours}
                type="button"
                role="radio"
                aria-checked={hours === option.hours}
                onClick={() => setHours(option.hours)}
                className={cn("h-9 rounded-xl border px-4 text-sm font-medium transition-colors", hours === option.hours ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-surface-subtle")}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} placeholder="What should they look at? (optional, e.g. ticket number)" className="sm:flex-1" />
            <Button disabled={allow.isPending} onClick={() => allow.mutate({ hours, note }, { onSuccess: () => setNote("") })}>
              {allow.isPending ? <Loader2 className="animate-spin" /> : null} Allow access
            </Button>
          </div>
        </div>
      )}
      <ErrorText error={allow.error ?? revoke.error} />
      {history.length ? (
        <div className="mt-5 border-t pt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Earlier access</p>
          <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
            {history.map((grant) => (
              <li key={grant.id}>
                {dateTime.format(new Date(grant.createdAt))} by {grant.grantedByName ?? "an admin"} ·{" "}
                {grant.revokedAt ? `turned off ${dateTime.format(new Date(grant.revokedAt))}${grant.revokedByName ? ` by ${grant.revokedByName}` : ""}` : `ended ${dateTime.format(new Date(grant.expiresAt))}`}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
}

function ExportPanel() {
  const exporter = useExportWorkspace();
  return (
    <Panel icon={Download} title="Export your data" description="Download everything in this workspace as a zip: every document as uploaded, every signed copy and attachment, and a file listing envelopes, recipients and audit trails.">
      <Button variant="outline" disabled={exporter.isPending} onClick={() => exporter.mutate()}>
        {exporter.isPending ? <Loader2 className="animate-spin" /> : <Download />}
        {exporter.isPending ? "Preparing download…" : "Download export"}
      </Button>
      <p className="mt-2 text-xs text-muted-foreground">Large workspaces can take a few minutes. Keep this page open.</p>
      <ErrorText error={exporter.error} />
    </Panel>
  );
}

function DeletePanel({ workspaceName }: { workspaceName: string }) {
  const deletion = useWorkspaceDeletion();
  const request = useRequestWorkspaceDeletion();
  const cancel = useCancelWorkspaceDeletion();
  const [confirm, setConfirm] = useState("");
  const pending = deletion.data?.request;
  const graceDays = deletion.data?.graceDays ?? 30;

  return (
    <Panel icon={Trash2} danger title="Delete this workspace" description={`Permanently deletes the workspace, every envelope and document (including files in your own connected storage) and its audit trails, ${graceDays} days after you ask. Members lose access then. This can't be undone afterwards.`}>
      {deletion.isLoading ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : pending ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center">
          <AlertTriangle className="size-5 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold">Scheduled for deletion on {longDate.format(new Date(pending.scheduledFor))}</p>
            <p className="text-muted-foreground">Download an export first if you want to keep anything. You can cancel until then.</p>
          </div>
          <Button variant="outline" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
            {cancel.isPending ? <Loader2 className="animate-spin" /> : null} Keep workspace
          </Button>
        </div>
      ) : deletion.data?.legalHold ? (
        <p className="rounded-2xl bg-surface-subtle p-4 text-sm text-muted-foreground">
          Legal hold is on, so this workspace can&apos;t be deleted. Turn it off on the{" "}
          <Link href="/settings/retention" className="font-semibold text-primary">
            Retention
          </Link>{" "}
          page first.
        </p>
      ) : (
        <div className="space-y-3">
          <label className="block text-sm" htmlFor="confirm-delete">
            Type <strong>{workspaceName}</strong> to confirm
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input id="confirm-delete" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="off" className="sm:max-w-sm" />
            <Button variant="destructive" disabled={confirm.trim() !== workspaceName.trim() || request.isPending} onClick={() => request.mutate(confirm, { onSuccess: () => setConfirm("") })}>
              {request.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />} Schedule deletion
            </Button>
          </div>
        </div>
      )}
      <ErrorText error={request.error ?? cancel.error} />
    </Panel>
  );
}

export default function DataPrivacyPage() {
  const me = useMe().data;
  const role = me?.workspace.role;
  const manager = role === "owner" || role === "admin";
  const owner = role === "owner";

  return (
    <div className="space-y-6 pb-10">
      <PageHeader eyebrow="Organisation settings" title="Data & privacy" description="Control who at Signet can see your documents, take your data with you, or delete it." />
      {manager ? <SupportAccessPanel /> : null}
      {owner ? (
        <>
          <ExportPanel />
          <DeletePanel workspaceName={me?.workspace.name ?? ""} />
        </>
      ) : me ? (
        <p className="rounded-3xl border bg-card p-6 text-sm text-muted-foreground">
          {manager ? "Only the workspace owner can export or delete the workspace." : "Only the workspace owner and admins can manage data and privacy settings."}
        </p>
      ) : null}
    </div>
  );
}
