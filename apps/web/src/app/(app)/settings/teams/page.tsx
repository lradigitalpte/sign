"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRightLeft, Check, Info, Loader2, Pencil, Plus, Trash2, Unlink, UserMinus, Users, UsersRound, X } from "lucide-react";

import { InitialBadge } from "@/components/settings/initial-badge";
import { PlanFeature } from "@/components/settings/plan-feature";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useCreateTeam,
  useDeleteTeam,
  useGroupDirectory,
  useMe,
  useMembers,
  useRemoveTeamGroup,
  useRemoveTeamMember,
  useRenameTeam,
  useSetTeamGroup,
  useSetTeamMember,
  useTeamDirectory,
  useTeamGroups,
  useTeamMembers,
} from "@/hooks/use-envelope-api";
import { switchTeam } from "@/lib/active-workspace";
import type { TeamSummary } from "@/lib/platform-api";
import { cn } from "@/lib/utils";

// Teams own envelopes, templates and folders. The default team holds everyone in the workspace; other
// teams are seen by workspace owners and admins and by the people on them.

function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  return <p role="alert" className="text-sm text-destructive">{error instanceof Error ? error.message : "Something went wrong."}</p>;
}

function CreateTeamForm() {
  const create = useCreateTeam();
  const [name, setName] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    create.mutate(name.trim(), { onSuccess: () => setName("") });
  };
  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input value={name} onChange={(event) => { setName(event.target.value); create.reset(); }} maxLength={60} placeholder="e.g. Sales, Legal, HR" aria-label="New team name" className="sm:max-w-xs" />
        <Button type="submit" disabled={!name.trim() || create.isPending}>
          {create.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
          Create team
        </Button>
      </div>
      <ErrorText error={create.error} />
    </form>
  );
}

function TeamRow({ team, current, selected, canDelete, onSelect }: { team: TeamSummary; current: boolean; selected: boolean; canDelete: boolean; onSelect: () => void }) {
  const rename = useRenameTeam();
  const remove = useDeleteTeam();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(team.name);

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || name.trim() === team.name) return setEditing(false);
    rename.mutate({ id: team.id, name: name.trim() }, { onSuccess: () => setEditing(false) });
  };

  return (
    <li className={cn("border-s-2 border-transparent p-4 transition-colors sm:px-5", selected ? "border-primary bg-primary/5" : "hover:bg-muted/40")}>
      <div className="flex flex-wrap items-center gap-3">
        {editing ? (
          <form onSubmit={save} className="flex flex-1 items-center gap-2">
            <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} autoFocus aria-label="Team name" className="h-9 max-w-xs" />
            <Button type="submit" size="sm" disabled={rename.isPending}>{rename.isPending ? <Loader2 className="animate-spin" /> : <Check />}Save</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setEditing(false); setName(team.name); rename.reset(); }}><X />Cancel</Button>
          </form>
        ) : (
          <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-3 text-start" aria-pressed={selected}>
            <InitialBadge name={team.name} />
            <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2 font-semibold">
              {team.name}
              {team.isDefault ? <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Default · everyone</span> : null}
              {current ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">You&apos;re working here</span> : null}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {team.memberCount} {team.memberCount === 1 ? "member" : "members"} · {team.envelopeCount} {team.envelopeCount === 1 ? "envelope" : "envelopes"}
              {team.role ? ` · you're a team ${team.role}` : ""}
            </span>
            </span>
          </button>
        )}
        {!editing ? (
          <div className="flex flex-wrap gap-1">
            {!current ? <Button variant="outline" size="sm" onClick={() => switchTeam(team.isDefault ? undefined : team.id)}><ArrowRightLeft />Switch</Button> : null}
            {team.canManage ? <Button variant="ghost" size="sm" onClick={() => setEditing(true)}><Pencil />Rename</Button> : null}
            {canDelete && !team.isDefault ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={remove.isPending}
                title={team.envelopeCount ? "Move or delete this team's envelopes first" : undefined}
                onClick={() => {
                  if (window.confirm(`Delete the team "${team.name}"? Its folders are deleted too. People keep their workspace access.`)) {
                    remove.mutate(team.id, { onSuccess: () => { if (current) switchTeam(undefined); } });
                  }
                }}
              >
                {remove.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}Delete
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="mt-2 space-y-1">
        <ErrorText error={rename.error} />
        <ErrorText error={remove.error} />
      </div>
    </li>
  );
}

function TeamMembersPanel({ team }: { team: TeamSummary }) {
  const members = useTeamMembers(team.id);
  const workspaceMembers = useMembers();
  const setMember = useSetTeamMember();
  const removeMember = useRemoveTeamMember();
  const [adding, setAdding] = useState("");
  const list = members.data?.data ?? [];
  const onTeam = new Set(list.map((m) => m.userId));
  const candidates = (workspaceMembers.data ?? []).filter((m) => !onTeam.has(m.id) && m.role !== "owner" && m.role !== "admin");

  return (
    <section className="rounded-3xl border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-subtle text-muted-foreground"><Users className="size-4" /></span>
        <div className="flex-1">
          <h2 className="text-sm font-semibold">{team.isDefault ? `People on ${team.name}` : `People added directly to ${team.name}`}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {team.isDefault
              ? "Everyone in the workspace is on the default team. Invite people from Members to add them."
              : "These people can see and work on this team's envelopes, templates and folders. Workspace owners and admins can always see every team."}
          </p>
        </div>
      </div>

      {!team.isDefault && team.canManage ? (
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <select value={adding} onChange={(event) => setAdding(event.target.value)} aria-label="Workspace member to add" className="h-10 rounded-xl border border-input bg-background px-3 text-sm shadow-xs sm:w-72">
            <option value="">{candidates.length ? "Choose someone to add…" : "Everyone else already has access"}</option>
            {candidates.map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
          </select>
          <Button
            disabled={!adding || setMember.isPending}
            onClick={() => setMember.mutate({ teamId: team.id, userId: adding, role: "member" }, { onSuccess: () => setAdding("") })}
          >
            {setMember.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
            Add to team
          </Button>
        </div>
      ) : null}

      <div className="mt-5">
        {members.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading…</p>
        ) : list.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nobody is on this team yet. Workspace owners and admins can still see it.</p>
        ) : (
          <ul className="divide-y rounded-2xl border">
            {list.map((member) => (
              <li key={member.userId} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{member.name || member.email}</span>
                  <span className="block truncate text-xs text-muted-foreground">{member.email}</span>
                </span>
                {team.isDefault || !team.canManage ? (
                  <span className="text-xs capitalize text-muted-foreground">{team.isDefault ? `Workspace ${member.role}` : `Team ${member.role}`}</span>
                ) : (
                  <>
                    <select
                      value={member.role}
                      onChange={(event) => setMember.mutate({ teamId: team.id, userId: member.userId, role: event.target.value as "admin" | "member" })}
                      aria-label={`Team role for ${member.name || member.email}`}
                      className="h-8 rounded-lg border border-input bg-background px-2 text-xs"
                    >
                      <option value="member">Team member</option>
                      <option value="admin">Team admin</option>
                    </select>
                    <Button variant="ghost" size="icon-sm" aria-label={`Remove ${member.name || member.email} from ${team.name}`} onClick={() => removeMember.mutate({ teamId: team.id, userId: member.userId })}>
                      <UserMinus />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-3 space-y-1">
        <ErrorText error={setMember.error} />
        <ErrorText error={removeMember.error} />
      </div>
    </section>
  );
}

/** Member groups attached to the team: everyone in them gets the group's team role. */
function TeamGroupsPanel({ team }: { team: TeamSummary }) {
  const attached = useTeamGroups(team.id);
  const directory = useGroupDirectory();
  const setGroup = useSetTeamGroup();
  const removeGroup = useRemoveTeamGroup();
  const [adding, setAdding] = useState("");
  const list = attached.data?.data ?? [];
  const onTeam = new Set(list.map((g) => g.id));
  const candidates = (directory.data?.data ?? []).filter((g) => !onTeam.has(g.id));

  return (
    <section className="rounded-3xl border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-subtle text-muted-foreground"><UsersRound className="size-4" /></span>
        <div className="flex-1">
          <h2 className="text-sm font-semibold">Groups with access to {team.name}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Everyone in an attached group can use this team with the group&apos;s role. People also added directly get the higher of the two.</p>
        </div>
        <Button asChild variant="outline" size="sm"><Link href="/settings/groups">Member groups</Link></Button>
      </div>

      {team.canManage ? (
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <select value={adding} onChange={(event) => setAdding(event.target.value)} aria-label="Group to attach" className="h-10 rounded-xl border border-input bg-background px-3 text-sm shadow-xs sm:w-72">
            <option value="">{candidates.length ? "Choose a group to attach…" : directory.data?.data.length ? "Every group is already attached" : "No groups yet"}</option>
            {candidates.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.memberCount})</option>)}
          </select>
          <Button disabled={!adding || setGroup.isPending} onClick={() => setGroup.mutate({ teamId: team.id, groupId: adding, role: "member" }, { onSuccess: () => setAdding("") })}>
            {setGroup.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
            Attach group
          </Button>
        </div>
      ) : null}

      <div className="mt-5">
        {attached.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading…</p>
        ) : list.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">No groups attached.</p>
        ) : (
          <ul className="divide-y rounded-2xl border">
            {list.map((group) => (
              <li key={group.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{group.name}</span>
                  <span className="block text-xs text-muted-foreground">{group.memberCount} {group.memberCount === 1 ? "person" : "people"}</span>
                </span>
                {team.canManage ? (
                  <>
                    <select
                      value={group.role}
                      onChange={(event) => setGroup.mutate({ teamId: team.id, groupId: group.id, role: event.target.value as "admin" | "member" })}
                      aria-label={`Team role for the group ${group.name}`}
                      className="h-8 rounded-lg border border-input bg-background px-2 text-xs"
                    >
                      <option value="member">As team members</option>
                      <option value="admin">As team admins</option>
                    </select>
                    <Button variant="ghost" size="icon-sm" aria-label={`Detach ${group.name} from ${team.name}`} onClick={() => removeGroup.mutate({ teamId: team.id, groupId: group.id })}>
                      <Unlink />
                    </Button>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">{group.role === "admin" ? "Team admins" : "Team members"}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-3 space-y-1">
        <ErrorText error={setGroup.error} />
        <ErrorText error={removeGroup.error} />
      </div>
    </section>
  );
}

export default function TeamsSettingsPage() {
  const directory = useTeamDirectory();
  const me = useMe().data;
  const teams = directory.data?.data ?? [];
  const canCreate = directory.data?.canCreate ?? false;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = teams.find((team) => team.id === selectedId) ?? teams.find((team) => team.id === me?.team.id) ?? teams[0];

  return (
    <div className="space-y-6 pb-10">
      <PageHeader eyebrow="Organisation settings" title="Teams" description="Split the workspace into teams, each with its own envelopes, templates and folders." />

      <div className="flex gap-3 rounded-2xl border border-blue-500/15 bg-blue-500/5 px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-blue-600 dark:text-blue-300" />
        <p>
          Everything you create goes into the team you&apos;re working in, shown in the top bar. Everyone is on the default team. Workspace owners and admins see every team; other people see only the teams they&apos;re added to, directly or through a member group. Billing, members and plan stay with the workspace.
        </p>
      </div>

      {directory.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading teams…</p>
      ) : directory.error ? (
        <ErrorText error={directory.error} />
      ) : (
        <>
          <section className="overflow-hidden rounded-3xl border bg-card shadow-sm">
            <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                <h2 className="text-sm font-semibold">Your teams</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">{canCreate ? "Select a team to choose who's on it." : "Teams you're on. Workspace owners and admins create teams."}</p>
              </div>
            </div>
            <ul className="divide-y">
              {teams.map((team) => (
                <TeamRow key={team.id} team={team} current={me?.team.id === team.id} selected={selected?.id === team.id} canDelete={canCreate} onSelect={() => setSelectedId(team.id)} />
              ))}
            </ul>
            {canCreate ? (
              <div className="border-t bg-surface-subtle/50 p-5 sm:px-6">
                <PlanFeature feature="teams_and_groups" what="Extra teams">
                  <CreateTeamForm />
                </PlanFeature>
              </div>
            ) : null}
          </section>

          {selected ? <TeamMembersPanel key={selected.id} team={selected} /> : null}
          {selected && !selected.isDefault ? <TeamGroupsPanel key={`groups-${selected.id}`} team={selected} /> : null}
        </>
      )}
    </div>
  );
}
