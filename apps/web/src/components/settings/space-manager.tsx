"use client";

import {
  Building2,
  Check,
  FolderKanban,
  Layers,
  Loader2,
  MoreVertical,
  Plus,
  Search,
  Shield,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useCreateGroup, useCreateTeam, useGroups, useTeams } from "@/hooks/use-envelope-api";

export function SpaceManager({ kind }: { kind: "teams" | "groups" }) {
  const teams = useTeams();
  const groups = useGroups();
  const query = kind === "teams" ? teams : groups;
  const teamMutation = useCreateTeam();
  const groupMutation = useCreateGroup();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const mutation = kind === "teams" ? teamMutation : groupMutation;
  const values = (query.data ?? []).filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase())
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      if (kind === "teams") {
        await teamMutation.mutateAsync(name.trim());
      } else {
        await groupMutation.mutateAsync({
          name: name.trim(),
          description: description.trim(),
        });
      }
      setName("");
      setDescription("");
      setIsCreateOpen(false);
    } catch {
      // Error handled by mutation.error
    }
  }

  const isTeams = kind === "teams";

  return (
    <div className="space-y-6">
      {/* Header & Tabs */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {isTeams ? "Teams" : "Member Groups"}
            </h1>
            <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold border border-border/70 bg-muted/50 text-foreground">
              {query.data?.length ?? 0} {isTeams ? "teams" : "groups"}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {isTeams
              ? "Organize your company into departmental workspaces for documents, templates, and members."
              : "Group members together for bulk signing permissions, approval chains, and notifications."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle tabs */}
          <div className="flex items-center rounded-xl bg-muted/60 p-1 border border-border/50 text-xs font-semibold">
            <Button
              variant={isTeams ? "secondary" : "ghost"}
              size="sm"
              asChild
              className="h-7 text-xs rounded-lg font-medium"
            >
              <Link href="/settings/teams" className="flex items-center gap-1.5">
                <Users className="size-3.5" />
                <span>Teams</span>
              </Link>
            </Button>
            <Button
              variant={!isTeams ? "secondary" : "ghost"}
              size="sm"
              asChild
              className="h-7 text-xs rounded-lg font-medium"
            >
              <Link href="/settings/groups" className="flex items-center gap-1.5">
                <Layers className="size-3.5" />
                <span>Groups</span>
              </Link>
            </Button>
          </div>

          <Button
            size="sm"
            onClick={() => setIsCreateOpen(true)}
            className="gap-1.5 rounded-xl font-semibold shadow-xs"
          >
            <Plus className="size-4" />
            <span>Create {isTeams ? "Team" : "Group"}</span>
          </Button>
        </div>
      </div>

      {/* Search Filter Bar */}
      <div className="relative">
        <Search className="absolute left-3.5 top-2.5 size-4 text-muted-foreground/80" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${isTeams ? "teams by name or slug" : "groups by name"}…`}
          className="h-9 pl-9 text-xs rounded-xl bg-card border-border/70"
        />
      </div>

      {/* Content Grid */}
      <div className="min-h-48">
        {query.isLoading ? (
          <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed bg-card/40">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : values.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {values.map((item) => (
              <div
                key={item.id}
                className="group relative flex flex-col justify-between rounded-2xl border border-border/70 bg-card/60 p-4 transition-all hover:border-border hover:shadow-xs"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`grid size-10 place-items-center rounded-xl font-bold text-sm border ${
                        isTeams
                          ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                          : "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                      }`}
                    >
                      {item.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-foreground leading-tight">
                        {item.name}
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                        {item.description || (item as any).slug || "Workspace"}
                      </p>
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
                      >
                        <MoreVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44 rounded-xl">
                      <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground">
                        Actions
                      </DropdownMenuLabel>
                      <DropdownMenuItem className="gap-2 text-xs cursor-pointer">
                        <UserPlus className="size-3.5" />
                        <span>Manage members</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2 text-xs cursor-pointer">
                        <Shield className="size-3.5" />
                        <span>Permissions</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-border/40 pt-3 text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Users className="size-3.5 text-muted-foreground/80" />
                    <span>
                      {item.memberCount} member{item.memberCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold border border-border/60 bg-muted/60 text-muted-foreground">
                    {isTeams ? "Team Workspace" : "Access Group"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-card/30 p-12 text-center">
            <div className="grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground mb-3">
              {isTeams ? <Users className="size-6" /> : <Layers className="size-6" />}
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              No {isTeams ? "teams" : "groups"} found
            </h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm">
              {search
                ? `No ${isTeams ? "teams" : "groups"} matched "${search}".`
                : isTeams
                ? "Get started by creating your first departmental team workspace."
                : "Create member groups to organize signing access and approval chains."}
            </p>
            <Button
              size="sm"
              onClick={() => setIsCreateOpen(true)}
              className="mt-4 gap-1.5 rounded-xl font-medium"
            >
              <Plus className="size-4" />
              <span>Create {isTeams ? "Team" : "Group"}</span>
            </Button>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              Create new {isTeams ? "team workspace" : "member group"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {isTeams
                ? "Teams let members collaborate on specific envelopes and templates."
                : "Groups let you assign multiple members to envelope signing roles simultaneously."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">
                {isTeams ? "Team Name" : "Group Name"}
              </label>
              <Input
                placeholder={isTeams ? "e.g. Sales, Human Resources, Legal" : "e.g. Executives, Financial Approvers"}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                className="h-9 text-xs rounded-xl"
              />
            </div>

            {!isTeams && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Description (Optional)</label>
                <Input
                  placeholder="Brief description of this group's responsibility"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="h-9 text-xs rounded-xl"
                />
              </div>
            )}

            {mutation.isError && (
              <p className="text-xs text-destructive font-medium">
                {mutation.error.message}
              </p>
            )}

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!name.trim() || mutation.isPending}
                className="gap-1.5"
              >
                {mutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
                <span>Create</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
