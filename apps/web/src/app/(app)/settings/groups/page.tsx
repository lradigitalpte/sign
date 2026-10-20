"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Check, Info, Loader2, Pencil, Plus, Trash2, UserMinus, Users, X } from "lucide-react";

import { InitialBadge } from "@/components/settings/initial-badge";
import { PlanFeature } from "@/components/settings/plan-feature";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useAddGroupMember,
  useCreateMemberGroup,
  useDeleteMemberGroup,
  useGroupDirectory,
  useGroupMembers,
  useMembers,
  useRemoveGroupMember,
  useUpdateMemberGroup,
} from "@/hooks/use-envelope-api";
import type { MemberGroup } from "@/lib/platform-api";
import { cn } from "@/lib/utils";

// Member groups are named sets of people in the workspace. Attaching a group to a team (Settings → Teams)
// gives everyone in it access to that team, so adding someone to "Legal" gives them every team Legal opens.

function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  return <p role="alert" className="text-sm text-destructive">{error instanceof Error ? error.message : "Something went wrong."}</p>;
}

function CreateGroupForm() {
  const create = useCreateMemberGroup();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    create.mutate({ name: name.trim(), description: description.trim() }, { onSuccess: () => { setName(""); setDescription(""); } });
  };
  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input value={name} onChange={(event) => { setName(event.target.value); create.reset(); }} maxLength={60} placeholder="Group name, e.g. Legal" aria-label="New group name" className="sm:max-w-56" />
        <Input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={300} placeholder="What it's for (optional)" aria-label="New group description" />
        <Button type="submit" disabled={!name.trim() || create.isPending}>
          {create.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
          Create group
        </Button>
      </div>
      <ErrorText error={create.error} />
    </form>
  );
}

function GroupRow({ group, selected, canManage, onSelect }: { group: MemberGroup; selected: boolean; canManage: boolean; onSelect: () => void }) {
  const update = useUpdateMemberGroup();
  const remove = useDeleteMemberGroup();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description);

  const save = (event: FormEvent) => {
    event.preventDefault();
    update.mutate({ id: group.id, name: name.trim(), description: description.trim() }, { onSuccess: () => setEditing(false) });
  };

  return (
    <li className={cn("border-s-2 border-transparent p-4 transition-colors sm:px-5", selected ? "border-primary bg-primary/5" : "hover:bg-muted/40")}>
      {editing ? (
        <form onSubmit={save} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} autoFocus aria-label="Group name" className="h-9 sm:max-w-56" />
          <Input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={300} aria-label="Group description" className="h-9" />
          <div className="flex gap-1">
            <Button type="submit" size="sm" disabled={!name.trim() || update.isPending}>{update.isPending ? <Loader2 className="animate-spin" /> : <Check />}Save</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setEditing(false); setName(group.name); setDescription(group.description); update.reset(); }}><X />Cancel</Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={onSelect} aria-pressed={selected} className="flex min-w-0 flex-1 items-center gap-3 text-start">
            <InitialBadge name={group.name} />
            <span className="min-w-0">
            <span className="block font-semibold">{group.name}</span>
            {group.description ? <span className="block truncate text-xs text-muted-foreground">{group.description}</span> : null}
            <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {group.memberCount} {group.memberCount === 1 ? "person" : "people"} ·
              {group.teams.length === 0 ? <span>not on any team yet</span> : group.teams.map((team) => (
                <span key={team.id} className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">{team.name} · {team.role === "admin" ? "team admins" : "team members"}</span>
              ))}
            </span>
            </span>
          </button>
          {canManage ? (
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)}><Pencil />Edit</Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={remove.isPending}
                onClick={() => {
                  const teams = group.teams.length ? ` Its members lose the access it gave them to ${group.teams.map((t) => t.name).join(", ")}.` : "";
                  if (window.confirm(`Delete the group "${group.name}"?${teams}`)) remove.mutate(group.id);
                }}
              >
                {remove.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}Delete
              </Button>
            </div>
          ) : null}
        </div>
      )}
      <div className="mt-2 space-y-1">
        <ErrorText error={update.error} />
        <ErrorText error={remove.error} />
      </div>
    </li>
  );
}

function GroupMembersPanel({ group, canManage }: { group: MemberGroup; canManage: boolean }) {
  const members = useGroupMembers(group.id);
  const workspaceMembers = useMembers();
  const add = useAddGroupMember();
  const remove = useRemoveGroupMember();
  const [adding, setAdding] = useState("");
  const list = members.data?.data ?? [];
  const inGroup = new Set(list.map((m) => m.userId));
  const candidates = (workspaceMembers.data ?? []).filter((m) => !inGroup.has(m.id));

  return (
    <section className="rounded-3xl border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-300"><Users className="size-4" /></span>
        <div className="flex-1">
          <h2 className="text-sm font-semibold">People in {group.name}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {group.teams.length
              ? `Everyone here can use ${group.teams.map((t) => t.name).join(", ")}.`
              : "Attach this group to a team in Settings → Teams to give these people access."}
          </p>
        </div>
        <Button asChild variant="outline" size="sm"><Link href="/settings/teams">Teams</Link></Button>
      </div>

      {canManage ? (
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <select value={adding} onChange={(event) => setAdding(event.target.value)} aria-label="Workspace member to add" className="h-10 rounded-xl border border-input bg-background px-3 text-sm shadow-xs sm:w-72">
            <option value="">{candidates.length ? "Choose someone to add…" : "Everyone is already in this group"}</option>
            {candidates.map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
          </select>
          <Button disabled={!adding || add.isPending} onClick={() => add.mutate({ groupId: group.id, userId: adding }, { onSuccess: () => setAdding("") })}>
            {add.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
            Add to group
          </Button>
        </div>
      ) : null}

      <div className="mt-5">
        {members.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading…</p>
        ) : list.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nobody is in this group yet.</p>
        ) : (
          <ul className="divide-y rounded-2xl border">
            {list.map((member) => (
              <li key={member.userId} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{member.name || member.email}</span>
                  <span className="block truncate text-xs text-muted-foreground">{member.email} · workspace {member.role}</span>
                </span>
                {canManage ? (
                  <Button variant="ghost" size="icon-sm" aria-label={`Remove ${member.name || member.email} from ${group.name}`} onClick={() => remove.mutate({ groupId: group.id, userId: member.userId })}>
                    <UserMinus />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-3 space-y-1">
        <ErrorText error={add.error} />
        <ErrorText error={remove.error} />
      </div>
    </section>
  );
}

export default function MemberGroupsPage() {
  const directory = useGroupDirectory();
  const groups = directory.data?.data ?? [];
  const canManage = directory.data?.canManage ?? false;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = groups.find((group) => group.id === selectedId) ?? groups[0];

  return (
    <div className="space-y-6 pb-10">
      <PageHeader eyebrow="Organisation settings" title="Member groups" description="Group people, then give a whole group access to a team at once." />

      <div className="flex gap-3 rounded-2xl border border-blue-500/15 bg-blue-500/5 px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-blue-600 dark:text-blue-300" />
        <p>
          A group on its own doesn&apos;t give access to anything. Attach it to a team in{" "}
          <Link href="/settings/teams" className="font-medium text-primary hover:underline">Teams</Link>, as team members or team admins, and everyone in the group gets that access. Someone in several groups gets the highest role any of them gives.
        </p>
      </div>

      {directory.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading groups…</p>
      ) : directory.error ? (
        <ErrorText error={directory.error} />
      ) : (
        <>
          <section className="overflow-hidden rounded-3xl border bg-card shadow-sm">
            <div className="border-b p-5 sm:px-6">
              <h2 className="text-sm font-semibold">Groups</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">{canManage ? "Select a group to choose who's in it." : "Workspace owners and admins manage groups."}</p>
            </div>
            {groups.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">No groups yet.{canManage ? " Create one below, such as Legal or Sales managers." : ""}</p>
            ) : (
              <ul className="divide-y">
                {groups.map((group) => (
                  <GroupRow key={group.id} group={group} selected={selected?.id === group.id} canManage={canManage} onSelect={() => setSelectedId(group.id)} />
                ))}
              </ul>
            )}
            {canManage ? (
              <div className="border-t bg-surface-subtle/50 p-5 sm:px-6">
                <PlanFeature feature="teams_and_groups" what="Member groups">
                  <CreateGroupForm />
                </PlanFeature>
              </div>
            ) : null}
          </section>

          {selected ? <GroupMembersPanel key={selected.id} group={selected} canManage={canManage} /> : null}
        </>
      )}
    </div>
  );
}
