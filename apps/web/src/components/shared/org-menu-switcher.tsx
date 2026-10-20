"use client";

import {
  Building2,
  Check,
  ChevronsUpDown,
  CreditCard,
  Inbox,
  LogOut,
  Plus,
  Settings,
  User,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateTeam, useEntitlements, useMe, usePlatformToken, useTeamDirectory, useWorkspaces } from "@/hooks/use-envelope-api";
import { switchTeam, switchWorkspace } from "@/lib/active-workspace";
import { ApiError, createWorkspace, initialsFor } from "@/lib/platform-api";

type OrgMenuSwitcherProps = {
  companyName: string;
  userName: string;
  userEmail: string;
};

export function OrgMenuSwitcher({ companyName, userName, userEmail }: OrgMenuSwitcherProps) {
  const t = useTranslations("AppShell");

  const [isOpen, setIsOpen] = useState(false);
  const { getAccessToken } = usePlatformToken();
  const me = useMe().data;
  const activeWorkspaceId = me?.workspace.id;
  const currentTeam = me?.team;
  const workspaces = useWorkspaces().data ?? [];
  // Teams own the envelopes, templates and folders shown in the app; the default team holds everyone.
  const teamDirectory = useTeamDirectory().data;
  const teams = teamDirectory?.data ?? [];
  const createTeam = useCreateTeam();
  // Extra teams are a Business feature once plan limits are on; the API refuses them otherwise.
  const entitlements = useEntitlements().data;
  const teamsLocked = Boolean(entitlements?.enforced && entitlements.features.teams_and_groups === false);

  // Create Org Modal
  const [isCreateOrgOpen, setIsCreateOrgOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);
  const [createOrgError, setCreateOrgError] = useState<string | null>(null);

  // Create Team Modal
  const [isCreateTeamOpen, setIsCreateTeamOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");

  const initials = initialsFor(userName || userEmail || "?");

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newOrgName.trim();
    if (!trimmed) return;
    setIsCreatingOrg(true);
    setCreateOrgError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      const created = await createWorkspace(token, trimmed);
      // Land on Members so the new owner can invite people straight away.
      switchWorkspace(created.id, "/members");
    } catch (err) {
      setCreateOrgError(err instanceof ApiError ? err.message : "Failed to create organisation.");
      setIsCreatingOrg(false);
    }
  };

  const handleCreateTeam = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTeamName.trim();
    if (!trimmed) return;
    // Land on the team's settings so its creator can add people straight away.
    createTeam.mutate(trimmed, { onSuccess: (created) => switchTeam(created.id, "/settings/teams") });
  };

  return (
    <>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={t("accountMenu")}
            className="flex items-center gap-2 rounded-xl border border-border/80 bg-card/60 px-2.5 py-1.5 text-xs font-semibold text-foreground shadow-2xs transition hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
          >
            <Avatar className="size-6 border shadow-2xs">
              <AvatarFallback className="text-[10px] font-bold bg-primary/15 text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="hidden sm:inline-block max-w-[160px] truncate text-left font-medium">
              {companyName}
              {currentTeam && !currentTeam.isDefault ? <span className="text-muted-foreground"> / {currentTeam.name}</span> : null}
            </span>
            <ChevronsUpDown className="size-3.5 text-muted-foreground shrink-0" />
          </button>
        </DropdownMenuTrigger>

        {/* 3-Column Dropdown matching Documenso's architecture */}
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className="z-50 w-[94vw] max-w-sm sm:max-w-xl md:max-w-3xl md:w-[44rem] p-0 shadow-2xl rounded-2xl border border-border overflow-hidden bg-popover/98 backdrop-blur-md"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
            {/* Column 1: Organisations */}
            <div className="flex flex-col p-3">
              <div className="flex items-center gap-2 pb-2.5 mb-1 border-b border-border/60 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <Building2 className="size-4 text-primary" />
                <span>Organisations</span>
              </div>
              <div className="flex-1 space-y-1 py-1 max-h-48 overflow-y-auto">
                {workspaces.map((workspace) => {
                  const isSelected = activeWorkspaceId === workspace.id;
                  return (
                    <DropdownMenuItem
                      key={workspace.id}
                      onClick={() => {
                        setIsOpen(false);
                        if (!isSelected) switchWorkspace(workspace.id);
                      }}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium cursor-pointer transition ${
                        isSelected
                          ? "bg-primary/10 text-primary font-semibold"
                          : "text-foreground hover:bg-muted"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate">{workspace.personal ? "Personal workspace" : workspace.name}</span>
                        <span className="block text-[10px] font-normal capitalize text-muted-foreground">{workspace.role}</span>
                      </span>
                      {isSelected && <Check className="size-3.5 text-primary shrink-0 ml-1" />}
                    </DropdownMenuItem>
                  );
                })}
              </div>

              <div className="pt-2 mt-auto border-t border-border/60">
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    setIsCreateOrgOpen(true);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition cursor-pointer"
                >
                  <Plus className="size-3.5 text-primary" />
                  <span>Create Organisation</span>
                </button>
              </div>
            </div>

            {/* Column 2: Teams */}
            <div className="flex flex-col p-3">
              <div className="flex items-center gap-2 pb-2.5 mb-1 border-b border-border/60 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <Users className="size-4 text-blue-500" />
                <span>Teams</span>
              </div>
              <div className="flex-1 space-y-1 py-1 max-h-48 overflow-y-auto">
                {teams.map((team) => {
                  const isSelected = currentTeam?.id === team.id;
                  return (
                    <DropdownMenuItem
                      key={team.id}
                      onClick={() => {
                        setIsOpen(false);
                        // The default team is what the API uses when none is chosen.
                        if (!isSelected) switchTeam(team.isDefault ? undefined : team.id);
                      }}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium cursor-pointer transition ${
                        isSelected
                          ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold"
                          : "text-foreground hover:bg-muted"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate">{team.name}</span>
                        <span className="block text-[10px] font-normal text-muted-foreground">
                          {team.isDefault ? "Everyone" : `${team.memberCount} ${team.memberCount === 1 ? "member" : "members"}`}
                        </span>
                      </span>
                      {isSelected && <Check className="size-3.5 text-blue-500 shrink-0 ml-1" />}
                    </DropdownMenuItem>
                  );
                })}
              </div>

              <div className="pt-2 mt-auto border-t border-border/60">
                {teamDirectory?.canCreate && teamsLocked ? (
                  <DropdownMenuItem asChild>
                    <Link href="/checkout/business" onClick={() => setIsOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer">
                      <Plus className="size-3.5 text-blue-500" />
                      <span>More teams with Business</span>
                    </Link>
                  </DropdownMenuItem>
                ) : teamDirectory?.canCreate ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      createTeam.reset();
                      setIsCreateTeamOpen(true);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition cursor-pointer"
                  >
                    <Plus className="size-3.5 text-blue-500" />
                    <span>Create Team</span>
                  </button>
                ) : null}
                <DropdownMenuItem asChild>
                  <Link href="/settings/teams" onClick={() => setIsOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer">
                    <Settings className="size-3.5" />
                    <span>Manage teams</span>
                  </Link>
                </DropdownMenuItem>
              </div>
            </div>

            {/* Column 3: Settings & Shortcuts */}
            <div className="flex flex-col p-3 bg-muted/20">
              <div className="flex items-center gap-2 pb-2.5 mb-1 border-b border-border/60 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <Settings className="size-4 text-muted-foreground" />
                <span>Settings</span>
              </div>
              <div className="flex-1 space-y-0.5 py-1 text-xs">
                <DropdownMenuItem asChild>
                  <Link
                    href="/inbox"
                    onClick={() => setIsOpen(false)}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
                  >
                    <Inbox className="size-3.5" />
                    <span>Inbox</span>
                  </Link>
                </DropdownMenuItem>

                <DropdownMenuItem asChild>
                  <Link
                    href="/members"
                    onClick={() => setIsOpen(false)}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
                  >
                    <Users className="size-3.5" />
                    <span>Members & Roles</span>
                  </Link>
                </DropdownMenuItem>

                <DropdownMenuItem asChild>
                  <Link
                    href="/settings/profile"
                    onClick={() => setIsOpen(false)}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
                  >
                    <User className="size-3.5" />
                    <span>Account</span>
                  </Link>
                </DropdownMenuItem>

                <DropdownMenuItem asChild>
                  <Link
                    href="/settings/company"
                    onClick={() => setIsOpen(false)}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
                  >
                    <Settings className="size-3.5" />
                    <span>Settings</span>
                  </Link>
                </DropdownMenuItem>

                <DropdownMenuItem asChild>
                  <Link
                    href="/settings/billing"
                    onClick={() => setIsOpen(false)}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
                  >
                    <CreditCard className="size-3.5" />
                    <span>Billing</span>
                  </Link>
                </DropdownMenuItem>

                <div className="pt-1 my-1 border-t border-border/60">
                  <DropdownMenuItem asChild variant="destructive">
                    {/* A plain <a>, not <Link>: sign-out redirects to WorkOS, which a client-side fetch can't follow (CORS). */}
                    <a
                      href="/auth/sign-out"
                      onClick={() => setIsOpen(false)}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-destructive hover:bg-destructive/10 cursor-pointer"
                    >
                      <LogOut className="size-3.5" />
                      <span>Sign Out</span>
                    </a>
                  </DropdownMenuItem>
                </div>
              </div>
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Create Organisation Dialog */}
      <Dialog open={isCreateOrgOpen} onOpenChange={setIsCreateOrgOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="size-5 text-primary" />
              Create Organisation
            </DialogTitle>
            <DialogDescription>
              Create a new organisation workspace to manage separate documents, billing, and team members.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={(e) => void handleCreateOrg(e)} className="space-y-4 py-2">
            {createOrgError ? <p className="text-xs text-destructive">{createOrgError}</p> : null}
            <div className="space-y-2">
              <Label htmlFor="org-name">Organisation name</Label>
              <Input
                id="org-name"
                required
                placeholder="Acme Legal Group"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                autoFocus
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateOrgOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isCreatingOrg}>
                {isCreatingOrg ? "Creating…" : "Create Organisation"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create Team Dialog */}
      <Dialog open={isCreateTeamOpen} onOpenChange={setIsCreateTeamOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="size-5 text-blue-500" />
              Create Team
            </DialogTitle>
            <DialogDescription>
              A team has its own envelopes, templates and folders inside {companyName}. Workspace owners and admins see every team; other people only see the teams they&apos;re on.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateTeam} className="space-y-4 py-2">
            {createTeam.error ? <p role="alert" className="text-xs text-destructive">{createTeam.error instanceof Error ? createTeam.error.message : "Couldn't create the team."}</p> : null}
            <div className="space-y-2">
              <Label htmlFor="team-name">Team name</Label>
              <Input
                id="team-name"
                required
                placeholder="Sales & Contracts"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                autoFocus
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateTeamOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createTeam.isPending}>{createTeam.isPending ? "Creating…" : "Create Team"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
