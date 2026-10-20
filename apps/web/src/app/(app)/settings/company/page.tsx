"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowRight, Building2, Check, Copy, CreditCard, Loader2, TriangleAlert, Users } from "lucide-react";

import { useLivePlans } from "@/components/marketing/plans-context";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMe, useMembers, useRenameWorkspace, useSubscription, useWorkspaceOverview } from "@/hooks/use-envelope-api";

const longDate = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long", day: "numeric" });

const ROLE_ORDER = ["owner", "admin", "member", "viewer"] as const;
const ROLE_LABELS: Record<string, [string, string]> = {
  owner: ["owner", "owners"],
  admin: ["admin", "admins"],
  member: ["member", "members"],
  viewer: ["viewer", "viewers"],
};

function Section({ icon: Icon, title, description, actions, children }: { icon: typeof Building2; title: string; description?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-subtle text-muted-foreground"><Icon className="size-4" /></span>
        <div className="flex-1">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="flex min-w-0 items-center gap-1">
      <code className="truncate font-mono text-xs">{value}</code>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={copied ? "Copied" : "Copy workspace ID"}
        onClick={() => {
          void navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </span>
  );
}

function NameForm({ name, canEdit, syncsToWorkOS }: { name: string; canEdit: boolean; syncsToWorkOS: boolean }) {
  const rename = useRenameWorkspace();
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? name;
  const trimmed = value.trim();
  const dirty = draft !== null && trimmed !== name;
  const valid = trimmed.length >= 1 && trimmed.length <= 100;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!dirty || !valid) return;
    rename.mutate(trimmed, { onSuccess: () => setDraft(null) });
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <label htmlFor="workspace-name" className="text-sm font-medium">Workspace name</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="workspace-name"
          value={value}
          maxLength={100}
          disabled={!canEdit || rename.isPending}
          onChange={(event) => {
            setDraft(event.target.value);
            rename.reset();
          }}
          aria-invalid={dirty && !valid}
          className="sm:max-w-md"
        />
        {canEdit ? (
          <Button type="submit" disabled={!dirty || !valid || rename.isPending}>
            {rename.isPending ? <Loader2 className="animate-spin" /> : null}
            Save name
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {!canEdit
          ? "Only owners and admins can rename the workspace."
          : syncsToWorkOS
            ? "Members see this name everywhere in Signet, including when they sign in."
            : "Members and recipients see this name, for example on signing emails."}
      </p>
      {rename.isSuccess && draft === null ? <p role="status" className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-300"><Check className="size-4" />Name saved.</p> : null}
      {rename.error ? <p role="alert" className="text-sm text-destructive">{rename.error instanceof Error ? rename.error.message : "Couldn't rename the workspace."}</p> : null}
    </form>
  );
}

export default function OrganizationSettingsPage() {
  const me = useMe();
  const overview = useWorkspaceOverview();
  const members = useMembers();
  const subscription = useSubscription();
  const plans = useLivePlans();
  const role = me.data?.workspace.role ?? "";
  const canEdit = role === "owner" || role === "admin";
  const workspace = overview.data;
  const sub = subscription.data;
  const planName = sub?.plan && sub.plan !== "free" ? plans.find((plan) => plan.id === sub.plan)?.name ?? sub.plan : "Free";
  const memberList = members.data ?? [];
  const owners = memberList.filter((member) => member.role === "owner");
  const roleCounts = ROLE_ORDER.map((r) => [r, memberList.filter((member) => member.role === r).length] as const).filter(([, count]) => count > 0);

  return (
    <div className="space-y-6 pb-10">
      <PageHeader eyebrow="Organisation settings" title="Organization" description="Your workspace's name, plan and people." />

      {overview.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading workspace…</p>
      ) : overview.error || !workspace ? (
        <section role="alert" className="rounded-3xl border bg-card p-6 text-center shadow-sm">
          <p className="font-medium">Couldn&apos;t load this workspace</p>
          <p className="mt-1 text-sm text-muted-foreground">{overview.error instanceof Error ? overview.error.message : "Try again in a moment."}</p>
          <Button variant="outline" className="mt-4" onClick={() => void overview.refetch()}>Try again</Button>
        </section>
      ) : (
        <>
          <Section icon={Building2} title="General" description={workspace.personal ? "This is your personal workspace. Invite people to share it, or create a separate workspace for a team." : undefined}>
            <NameForm key={workspace.name} name={workspace.name} canEdit={canEdit} syncsToWorkOS={workspace.nameSyncsToWorkOS} />
            <dl className="mt-6 grid gap-x-6 gap-y-4 border-t pt-5 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Your role</dt>
                <dd className="mt-1 font-semibold capitalize">{role || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Created</dt>
                <dd className="mt-1 font-semibold">{longDate.format(new Date(workspace.createdAt))}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Workspace ID</dt>
                <dd className="mt-0.5"><CopyValue value={workspace.id} /></dd>
              </div>
            </dl>
          </Section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section
              icon={CreditCard}
              title="Plan"
              actions={<Button asChild variant="outline" size="sm"><Link href="/settings/billing">Billing &amp; plan</Link></Button>}
            >
              <p className="text-2xl font-semibold tracking-tight">{subscription.isLoading ? "…" : planName}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {sub && sub.plan !== "free" ? `${sub.seatsUsed} of ${sub.seats} sender ${sub.seats === 1 ? "seat" : "seats"} used` : "Upgrade to add sender seats and team features."}
              </p>
            </Section>

            <Section
              icon={Users}
              title="People"
              actions={<Button asChild variant="outline" size="sm"><Link href="/members">Manage members <ArrowRight /></Link></Button>}
            >
              {members.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : (
                <>
                  <p className="text-2xl font-semibold tracking-tight">{memberList.length} {memberList.length === 1 ? "member" : "members"}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {roleCounts.map(([r, count]) => `${count} ${ROLE_LABELS[r][count === 1 ? 0 : 1]}`).join(" · ") || "No members yet"}
                  </p>
                  {owners.length ? (
                    <p className="mt-3 truncate text-xs text-muted-foreground">
                      {owners.length === 1 ? "Owner" : "Owners"}: {owners.map((owner) => owner.name || owner.email).join(", ")}
                    </p>
                  ) : null}
                </>
              )}
            </Section>
          </div>

          {role === "owner" ? (
            <section className="flex flex-col gap-3 rounded-3xl border border-red-500/20 bg-red-500/5 p-5 sm:flex-row sm:items-center sm:p-6">
              <TriangleAlert className="size-5 shrink-0 text-red-600 dark:text-red-400" />
              <div className="flex-1">
                <h2 className="text-sm font-semibold">Delete this workspace</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">Export your documents first. Deletion is scheduled with a 30-day grace period, and you can cancel it in that time.</p>
              </div>
              <Button asChild variant="outline"><Link href="/settings/data">Data &amp; privacy</Link></Button>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
