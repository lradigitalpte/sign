import { Building2, Flag, MoreHorizontal, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { Button } from "@signet/ui/components/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@signet/ui/components/dropdown-menu";
import { Input } from "@signet/ui/components/input";
import { Label } from "@signet/ui/components/label";
import { cn } from "@signet/ui/lib/utils";

import { ActionDialog, Notice, type ActionSpec } from "@/components/action-dialog";
import { useCan } from "@/lib/admin-context";
import { Card, EmptyState, ErrorState, Loading, PageHeader } from "@/components/page";
import { useFlags, useWorkspaces } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import type { FeatureFlag, WorkspaceSummary } from "@/lib/types";

/** An on/off switch; clicking asks for confirmation instead of flipping straight away. */
function Switch({ on, label, disabled, onClick }: { on: boolean; label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60", on ? "bg-primary" : "bg-muted-foreground/30")}
    >
      <span className={cn("inline-block size-5 rounded-full bg-white shadow-sm transition-transform", on ? "translate-x-5.5" : "translate-x-0.5")} />
    </button>
  );
}

function OnOff({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  return (
    <div role="radiogroup" aria-label="Value" className="flex gap-1.5">
      {[true, false].map((option) => (
        <button
          key={String(option)}
          type="button"
          role="radio"
          aria-checked={value === option}
          onClick={() => onChange(option)}
          className={cn("h-8 rounded-lg border px-3 text-sm font-medium transition-colors", value === option ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}
        >
          {option ? "On" : "Off"}
        </button>
      ))}
    </div>
  );
}

// ---- Specs ----

type NewFlag = { key: string; description: string; enabled: boolean };

function createSpec(draft: NewFlag, setDraft: (next: NewFlag) => void): ActionSpec {
  const update = (patch: Partial<NewFlag>) => setDraft({ ...draft, ...patch });
  return {
    title: "New feature flag",
    description: "The web app reads flags from GET /v1/features. A flag nobody checks yet does nothing.",
    confirmLabel: "Create flag",
    reasonRequired: false,
    reasonPlaceholder: "e.g. Gradual rollout of bulk send",
    ready: /^[a-z][a-z0-9_.-]{1,62}$/.test(draft.key),
    fields: (
      <>
        <div className="grid gap-2">
          <Label htmlFor="flag-key">Key</Label>
          <Input id="flag-key" value={draft.key} onChange={(event) => update({ key: event.target.value.toLowerCase().replace(/\s+/g, "-") })} placeholder="bulk-send" className="font-mono" autoComplete="off" />
          <p className="text-xs text-muted-foreground">Lowercase letters, numbers, dots, dashes or underscores. Can&apos;t be renamed later.</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="flag-description">What it controls</Label>
          <Input id="flag-description" value={draft.description} onChange={(event) => update({ description: event.target.value })} maxLength={300} placeholder="Send one template to many recipients at once" />
        </div>
        <div className="grid gap-2">
          <Label>For everyone</Label>
          <OnOff value={draft.enabled} onChange={(enabled) => update({ enabled })} />
        </div>
      </>
    ),
    request: (reason) => ({ method: "POST", path: "/flags", body: { ...draft, reason } }),
    success: () => `Created ${draft.key}.`,
  };
}

function defaultSpec(flag: FeatureFlag): ActionSpec {
  const next = !flag.enabled;
  const exceptions = flag.overrides.filter((o) => o.enabled !== next).length;
  return {
    title: `Turn ${flag.key} ${next ? "on" : "off"} for everyone?`,
    description: `Every workspace without its own setting gets it ${next ? "on" : "off"} on its next page load.${exceptions ? ` ${exceptions} ${exceptions === 1 ? "workspace keeps its" : "workspaces keep their"} own setting.` : ""}`,
    confirmLabel: next ? "Turn on" : "Turn off",
    destructive: !next,
    reasonPlaceholder: next ? "e.g. Beta went well, launching to everyone" : "e.g. Rolling back after bug reports",
    request: (reason) => ({ method: "PATCH", path: `/flags/${encodeURIComponent(flag.key)}`, body: { enabled: next, reason } }),
    success: () => `${flag.key} is ${next ? "on" : "off"} for everyone without their own setting.`,
  };
}

type OverrideDraft = { query: string; workspace: WorkspaceSummary | null; enabled: boolean };

function WorkspacePicker({ draft, setDraft }: { draft: OverrideDraft; setDraft: (next: OverrideDraft) => void }) {
  const results = useWorkspaces({ query: draft.query, pageSize: 6 });
  if (draft.workspace) {
    return (
      <div className="flex items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2 text-sm">
        <Building2 className="size-4 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-medium">{draft.workspace.name}</span>
        <Button type="button" variant="ghost" size="icon-xs" aria-label="Choose another workspace" onClick={() => setDraft({ ...draft, workspace: null })}>
          <X />
        </Button>
      </div>
    );
  }
  return (
    <div className="grid gap-1.5">
      <Input value={draft.query} onChange={(event) => setDraft({ ...draft, query: event.target.value })} placeholder="Search name, ID or member email" autoComplete="off" autoFocus />
      <ul className="max-h-48 overflow-y-auto rounded-xl border">
        {(results.data?.items ?? []).map((workspace) => (
          <li key={workspace.id}>
            <button type="button" onClick={() => setDraft({ ...draft, workspace })} className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm hover:bg-muted/60">
              <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{workspace.ownerEmail}</span>
            </button>
          </li>
        ))}
        {results.data && results.data.items.length === 0 ? <li className="px-3 py-2 text-sm text-muted-foreground">No workspaces match.</li> : null}
      </ul>
    </div>
  );
}

function overrideSpec(flag: FeatureFlag, draft: OverrideDraft, setDraft: (next: OverrideDraft) => void): ActionSpec {
  return {
    title: `Set ${flag.key} for one workspace`,
    description: `Overrides the global setting (${flag.enabled ? "on" : "off"}) for this workspace only.`,
    confirmLabel: "Save",
    reasonPlaceholder: "e.g. Customer joined the beta",
    ready: draft.workspace !== null,
    fields: (
      <>
        <div className="grid gap-2">
          <Label>Workspace</Label>
          <WorkspacePicker draft={draft} setDraft={setDraft} />
        </div>
        <div className="grid gap-2">
          <Label>Value</Label>
          <OnOff value={draft.enabled} onChange={(enabled) => setDraft({ ...draft, enabled })} />
        </div>
      </>
    ),
    request: (reason) => ({ method: "PUT", path: `/flags/${encodeURIComponent(flag.key)}/overrides/${encodeURIComponent(draft.workspace?.id ?? "")}`, body: { enabled: draft.enabled, reason } }),
    success: () => `${flag.key} is ${draft.enabled ? "on" : "off"} for ${draft.workspace?.name}.`,
  };
}

function removeOverrideSpec(flag: FeatureFlag, override: FeatureFlag["overrides"][number]): ActionSpec {
  return {
    title: `Remove ${override.workspaceName}'s setting?`,
    description: `${override.workspaceName} goes back to the global setting: ${flag.enabled ? "on" : "off"}.`,
    confirmLabel: "Remove",
    reasonPlaceholder: "e.g. Beta finished",
    request: (reason) => ({ method: "PUT", path: `/flags/${encodeURIComponent(flag.key)}/overrides/${encodeURIComponent(override.workspaceId)}`, body: { enabled: null, reason } }),
    success: () => `${override.workspaceName} now follows the global setting.`,
  };
}

function deleteSpec(flag: FeatureFlag): ActionSpec {
  return {
    title: `Delete ${flag.key}?`,
    description: "The flag and its workspace settings are removed. Code that still checks it will see it as off. Only delete flags nothing uses any more.",
    confirmLabel: "Delete flag",
    destructive: true,
    reasonPlaceholder: "e.g. Feature fully launched; check removed from the code",
    request: (reason) => ({ method: "DELETE", path: `/flags/${encodeURIComponent(flag.key)}`, body: { reason } }),
    success: () => `Deleted ${flag.key}.`,
  };
}

// ---- Page ----

export function FlagsPage() {
  const flags = useFlags();
  const canManage = useCan("super_admin");
  const [spec, setSpec] = useState<ActionSpec | null>(null);
  const [creating, setCreating] = useState<NewFlag | null>(null);
  const [overriding, setOverriding] = useState<{ flag: FeatureFlag; draft: OverrideDraft } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Forms with inputs keep their state here, so their specs are rebuilt as the inputs change.
  const active = creating
    ? createSpec(creating, setCreating)
    : overriding
      ? overrideSpec(overriding.flag, overriding.draft, (draft) => setOverriding({ ...overriding, draft }))
      : spec;
  const close = () => {
    setSpec(null);
    setCreating(null);
    setOverriding(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Feature flags"
        description="Turn features on for everyone, or for chosen workspaces first. Changes apply on the customer's next page load."
        actions={
          canManage ? (
            <Button size="sm" onClick={() => setCreating({ key: "", description: "", enabled: false })}>
              <Plus /> New flag
            </Button>
          ) : null
        }
      />
      <Notice message={notice} onDismiss={() => setNotice(null)} />

      {flags.isPending ? (
        <Card>
          <Loading />
        </Card>
      ) : flags.error ? (
        <Card>
          <ErrorState error={flags.error} onRetry={() => void flags.refetch()} />
        </Card>
      ) : flags.data.length === 0 ? (
        <Card>
          <EmptyState title="No feature flags yet" description="Create one, then check it in the web app with the flags from GET /v1/features." />
        </Card>
      ) : (
        <Card className="divide-y overflow-hidden">
          {flags.data.map((flag) => (
            <div key={flag.key} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start">
              <span className="hidden size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground sm:grid">
                <Flag className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-sm font-semibold break-all">{flag.key}</p>
                {flag.description ? <p className="mt-0.5 text-sm text-muted-foreground">{flag.description}</p> : null}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {flag.overrides.map((override) => (
                    <span key={override.workspaceId} className={cn("inline-flex items-center gap-1 rounded-full border py-0.5 ps-2.5 pe-1 text-xs", override.enabled ? "border-emerald-500/30 bg-emerald-500/5" : "bg-muted/50")}>
                      <span className={cn("font-medium", override.enabled ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground")}>{override.enabled ? "On" : "Off"}</span>
                      <Link to={`/workspaces/${override.workspaceId}`} className="max-w-40 truncate hover:underline">
                        {override.workspaceName}
                      </Link>
                      {canManage ? (
                        <button type="button" aria-label={`Remove ${override.workspaceName}'s setting`} onClick={() => setSpec(removeOverrideSpec(flag, override))} className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                          <X className="size-3" />
                        </button>
                      ) : null}
                    </span>
                  ))}
                  {canManage ? (
                    <button
                      type="button"
                      onClick={() => setOverriding({ flag, draft: { query: "", workspace: null, enabled: !flag.enabled } })}
                      className="inline-flex h-6 items-center gap-1 rounded-full border border-dashed px-2.5 text-xs text-muted-foreground hover:border-solid hover:text-foreground"
                    >
                      <Plus className="size-3" /> Workspace
                    </button>
                  ) : flag.overrides.length === 0 ? (
                    <span className="text-xs text-muted-foreground">No workspace-specific settings</span>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Everyone</span>
                  <Switch on={flag.enabled} label={`${flag.key} for everyone`} disabled={!canManage} onClick={() => setSpec(defaultSpec(flag))} />
                  {canManage ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Options for ${flag.key}`}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem variant="destructive" onSelect={() => setSpec(deleteSpec(flag))}>
                          <Trash2 /> Delete flag
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
                <span className="text-xs text-muted-foreground" title={flag.updatedAt}>
                  Changed {formatRelative(flag.updatedAt)}
                </span>
              </div>
            </div>
          ))}
        </Card>
      )}

      <ActionDialog spec={active} onClose={close} onDone={setNotice} />
    </div>
  );
}
