"use client";

import { Building2, Loader2, RotateCcw, SlidersHorizontal, Users } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useMe, useTeamSettings, useUpdateTeamSettings, useUpdateWorkspaceSettings, useWorkspaceSettings } from "@/hooks/use-envelope-api";
import type { TeamSettingsSection, WorkspaceSettings } from "@/lib/platform-api";
import { cn } from "@/lib/utils";

// Preferences, Notifications and Branding are set for the organization (workspace), and any team except the
// default one can customize its own. This hook gives a settings page the values and save function for
// whichever of the two is being edited; SettingsScopeBar lets the user switch and customize.

export type Scope = "organization" | "team";

export function useScopedSettings(section: TeamSettingsSection) {
  const me = useMe().data;
  const team = me?.team;
  const isWorkspaceAdmin = me?.workspace.role === "owner" || me?.workspace.role === "admin";
  const onTeam = Boolean(team && !team.isDefault);
  const [scope, setScope] = useState<Scope>("team");
  const editingTeam = onTeam && scope === "team";

  const organization = useWorkspaceSettings(section);
  const saveOrganization = useUpdateWorkspaceSettings(section);
  const teamView = useTeamSettings(section, onTeam);
  const saveTeam = useUpdateTeamSettings(section);
  const customized = teamView.data?.customized ?? false;
  const active = editingTeam ? saveTeam : saveOrganization;

  return {
    section,
    team,
    onTeam,
    scope: editingTeam ? ("team" as const) : ("organization" as const),
    setScope: (next: Scope) => {
      saveOrganization.reset();
      saveTeam.reset();
      setScope(next);
    },
    /** The team has its own values for this section. */
    customized,
    /** The user may customize this team (team admins and workspace admins). */
    canCustomize: Boolean(teamView.data?.canEdit),
    /** Values to show: the team's effective settings, or the organization's. */
    data: (editingTeam ? teamView.data?.effective : organization.data) as WorkspaceSettings | undefined,
    isLoading: editingTeam ? teamView.isLoading : organization.isLoading,
    /** A team that uses the organization's settings shows them read-only until it's customized. */
    canEdit: editingTeam ? Boolean(teamView.data?.canEdit && customized) : isWorkspaceAdmin,
    save: (values: WorkspaceSettings) => (editingTeam ? saveTeam.mutateAsync(values) : saveOrganization.mutateAsync(values)),
    saving: active.isPending,
    saved: active.isSuccess,
    error: active.error as Error | null,
    /** Start customizing the team from the given values (normally what the page shows). */
    customize: (values: WorkspaceSettings) => saveTeam.mutateAsync(values),
    /** Go back to the organization's settings. */
    reset: () => saveTeam.mutateAsync(null),
    switching: saveTeam.isPending,
  };
}

export type ScopedSettings = ReturnType<typeof useScopedSettings>;

/** Organization or team switch, and the team's customize / reset controls. Hidden on the default team. */
export function SettingsScopeBar({ scoped, label, customizeWith }: { scoped: ScopedSettings; label: string; customizeWith: WorkspaceSettings }) {
  if (!scoped.onTeam || !scoped.team) return null;
  const teamName = scoped.team.name;
  const options: { value: Scope; label: string; icon: typeof Users }[] = [
    { value: "team", label: teamName, icon: Users },
    { value: "organization", label: "Organisation defaults", icon: Building2 },
  ];
  return (
    <section className="space-y-3 rounded-3xl border bg-card p-4 shadow-sm sm:p-5">
      <div role="radiogroup" aria-label="Which settings to edit" className="inline-flex rounded-xl border bg-muted/50 p-1">
        {options.map(({ value, label: text, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={scoped.scope === value}
            onClick={() => scoped.setScope(value)}
            className={cn("flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition", scoped.scope === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            <Icon className="size-3.5" />
            {text}
          </button>
        ))}
      </div>
      {scoped.scope === "team" ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm text-muted-foreground">
            {scoped.customized
              ? `${teamName} has its own ${label}. Changes here only affect ${teamName}'s new envelopes.`
              : `${teamName} uses the organisation's ${label}. Customize them to give ${teamName} its own.`}
            {!scoped.canCustomize ? " Only team admins and workspace admins can change this." : ""}
          </p>
          {scoped.canCustomize ? (
            scoped.customized ? (
              <Button variant="outline" size="sm" disabled={scoped.switching} onClick={() => void scoped.reset()}>
                {scoped.switching ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                Use organisation settings
              </Button>
            ) : (
              <Button size="sm" disabled={scoped.switching} onClick={() => void scoped.customize(customizeWith)}>
                {scoped.switching ? <Loader2 className="animate-spin" /> : <SlidersHorizontal />}
                Customize for {teamName}
              </Button>
            )
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">These are the organisation&apos;s {label}. Every team uses them unless it has customized its own, and the default team always does.</p>
      )}
    </section>
  );
}
