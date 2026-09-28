"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  Loader2,
  LogOut,
  Mail,
  MoreHorizontal,
  PenTool,
  Plus,
  RotateCw,
  Search,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";

import { PageHeader } from "@/components/shared/page-header";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useInvitations, useMe, useMembers, usePlatformToken } from "@/hooks/use-envelope-api";
import { switchWorkspace } from "@/lib/active-workspace";
import {
  ApiError,
  createWorkspace,
  initialsFor,
  inviteMember,
  isWorkspaceManager,
  removeMember,
  resendInvitation,
  revokeInvitation,
  updateMemberRole,
  type Member,
  type OrganizationInvitation,
} from "@/lib/platform-api";

type TabType = "active" | "pending";

const ROLE_OPTIONS = [
  {
    value: "admin",
    label: "Admin",
    icon: ShieldCheck,
    description: "Invite and manage members, change workspace settings, and manage all documents.",
  },
  {
    value: "member",
    label: "Member",
    icon: UserCheck,
    description: "Create, upload, send, and sign documents. Cannot change settings or members.",
  },
  {
    value: "viewer",
    label: "Viewer",
    icon: Eye,
    description: "Read-only, for auditors: view documents, recipients, and audit trails. Cannot create, send, or delete.",
  },
] as const;

const ROLE_BADGE: Record<string, { className: string; icon: typeof UserCheck; scope: string; permissions: string }> = {
  owner: {
    className: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20",
    icon: ShieldAlert,
    scope: "Full ownership",
    permissions: "Full control: manages members and their roles, workspace settings, branding, storage, and every document. The owner can't be removed.",
  },
  admin: {
    className: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20",
    icon: ShieldCheck,
    scope: "Administrator",
    permissions: "Can invite and remove members, change roles, configure workspace settings and storage, and manage every document.",
  },
  member: {
    className: "bg-neutral-500/10 text-neutral-700 dark:text-neutral-300 border border-neutral-500/20",
    icon: UserCheck,
    scope: "Standard member",
    permissions: "Can create, send, void, and sign documents, use templates and folders, and self-sign PDFs. Cannot change settings or members.",
  },
  viewer: {
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20",
    icon: Eye,
    scope: "Read-only (audit)",
    permissions: "Can view every document, its recipients, and its audit trail, and download certificates. Cannot create, send, edit, or delete anything.",
  },
};

function roleBadge(role?: string) {
  return ROLE_BADGE[role ?? ""] ?? ROLE_BADGE.member;
}

export default function MembersPage() {
  const t = useTranslations("Members");
  const queryClient = useQueryClient();
  const { getAccessToken } = usePlatformToken();
  const meQuery = useMe();
  const me = meQuery.data?.user;
  const workspace = meQuery.data?.workspace;
  const canManage = isWorkspaceManager(workspace?.role);
  const isPersonal = Boolean(workspace?.personal);

  const membersQuery = useMembers();
  const invitationsQuery = useInvitations(canManage && !isPersonal);

  // Create organization (shown in a personal workspace, which can't have members)
  const [newOrgName, setNewOrgName] = useState("");
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);

  const members = membersQuery.data ?? [];
  const invitations = invitationsQuery.data ?? [];

  const [activeTab, setActiveTab] = useState<TabType>("active");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals state
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null);

  // Role change state
  const [roleChangeMember, setRoleChangeMember] = useState<Member | null>(null);
  const [targetRole, setTargetRole] = useState<string>("member");
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);

  // Remove member state
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  // Selected Member Profile details modal
  const [selectedMemberProfile, setSelectedMemberProfile] = useState<Member | null>(null);

  // Action status message
  const [actionMessage, setActionMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Filtered members
  const filteredMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
    );
  }, [members, searchQuery]);

  // Filtered invitations
  const filteredInvitations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return invitations;
    return invitations.filter((inv) => inv.email.toLowerCase().includes(q));
  }, [invitations, searchQuery]);

  // Stats
  const adminCount = useMemo(
    () => members.filter((m) => m.role === "admin" || m.role === "owner").length,
    [members]
  );

  const showNotification = (text: string, type: "success" | "error" = "success") => {
    setActionMessage({ text, type });
    setTimeout(() => {
      setActionMessage((current) => (current?.text === text ? null : current));
    }, 4000);
  };

  const handleSendInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!inviteEmail.trim()) return;

    setIsInviting(true);
    setInviteError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      const invitation = await inviteMember(token, {
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      await queryClient.invalidateQueries({ queryKey: ["members-invitations"] });
      setIsInviteOpen(false);
      setInviteEmail("");
      setInviteRole("member");
      showNotification(
        invitation.emailSent
          ? `Invitation emailed to ${invitation.email}`
          : `Invitation created for ${invitation.email}. Email isn't configured, so use "Copy link" to share it.`
      );
      setActiveTab("pending");
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : "Failed to send invitation.");
    } finally {
      setIsInviting(false);
    }
  };

  const handleUpdateRole = async () => {
    if (!roleChangeMember) return;
    setIsUpdatingRole(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      await updateMemberRole(token, roleChangeMember.id, targetRole);
      await queryClient.invalidateQueries({ queryKey: ["members"] });
      showNotification(`Updated ${roleChangeMember.name}'s role to ${targetRole}`);
      setRoleChangeMember(null);
    } catch (err) {
      showNotification(err instanceof ApiError ? err.message : "Failed to update role", "error");
    } finally {
      setIsUpdatingRole(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!removeTarget) return;
    setIsRemoving(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      await removeMember(token, removeTarget.id);
      await queryClient.invalidateQueries({ queryKey: ["members"] });
      showNotification(`Removed ${removeTarget.name} from the workspace`);
      setRemoveTarget(null);
    } catch (err) {
      showNotification(err instanceof ApiError ? err.message : "Failed to remove member", "error");
    } finally {
      setIsRemoving(false);
    }
  };

  const handleRevokeInvite = async (invitation: OrganizationInvitation) => {
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      await revokeInvitation(token, invitation.id);
      await queryClient.invalidateQueries({ queryKey: ["members-invitations"] });
      showNotification(`Revoked invitation for ${invitation.email}`);
    } catch (err) {
      showNotification(err instanceof ApiError ? err.message : "Failed to revoke invitation", "error");
    }
  };

  const handleResendInvite = async (invitation: OrganizationInvitation) => {
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      const resent = await resendInvitation(token, invitation.id);
      await queryClient.invalidateQueries({ queryKey: ["members-invitations"] });
      showNotification(
        resent.emailSent
          ? `Resent invitation to ${invitation.email}`
          : `Renewed the invitation link for ${invitation.email}. Use "Copy link" to share it.`
      );
    } catch (err) {
      showNotification(err instanceof ApiError ? err.message : "Failed to resend invitation", "error");
    }
  };

  const copyInviteLink = (token: string, id: string) => {
    const link = `${window.location.origin}/invitations/${token}`;
    void navigator.clipboard.writeText(link);
    setCopiedTokenId(id);
    setTimeout(() => setCopiedTokenId(null), 2500);
    showNotification("Invitation link copied to clipboard");
  };

  const handleCreateOrg = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newOrgName.trim()) return;
    setIsCreatingOrg(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      const created = await createWorkspace(token, newOrgName.trim());
      switchWorkspace(created.id, "/members");
    } catch (err) {
      showNotification(err instanceof ApiError ? err.message : "Failed to create organization", "error");
      setIsCreatingOrg(false);
    }
  };

  const openInvite = () => {
    setInviteError(null);
    setIsInviteOpen(true);
  };
  const canInvite = canManage && !isPersonal;
  const profileBadge = roleBadge(selectedMemberProfile?.role);
  const ProfileBadgeIcon = profileBadge.icon;

  return (
    <main className="mx-auto w-full max-w-[1200px] px-3 py-6 sm:px-5 lg:px-8">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader title={t("title")} description={t("description")} />
        {canInvite ? (
          <Button onClick={openInvite} className="gap-2 shadow-sm shrink-0">
            <UserPlus className="size-4" />
            {t("inviteMember")}
          </Button>
        ) : null}
      </div>

      {isPersonal ? (
        <div className="mt-6 rounded-2xl border border-primary/25 bg-primary/[0.04] p-5">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Building2 className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">This is your personal workspace</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Personal workspaces are just for you. To work with other people, create an organization. You&apos;ll be its owner, and you can invite admins, members, and viewers. Your personal workspace stays available from the account menu.
              </p>
              <form onSubmit={(e) => void handleCreateOrg(e)} className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Input
                  required
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  placeholder="Organization name, e.g. Acme Legal"
                  className="h-9 text-sm sm:max-w-xs"
                />
                <Button type="submit" disabled={isCreatingOrg} className="h-9 gap-2 text-xs">
                  {isCreatingOrg ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                  Create organization
                </Button>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {/* Notification Toast Banner */}
      {actionMessage ? (
        <div
          className={`mt-4 flex items-center gap-2 rounded-xl border p-3 text-sm animate-in fade-in slide-in-from-top-2 ${
            actionMessage.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {actionMessage.type === "success" ? (
            <CheckCircle2 className="size-4 shrink-0" />
          ) : (
            <AlertCircle className="size-4 shrink-0" />
          )}
          <span>{actionMessage.text}</span>
        </div>
      ) : null}

      {/* Metric Cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-2xs">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Users className="size-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Total Members</p>
            <p className="text-2xl font-bold text-foreground">{members.length}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-2xs">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Admins & Owners</p>
            <p className="text-2xl font-bold text-foreground">{adminCount}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-2xs">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Clock className="size-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Pending Invitations</p>
            <p className="text-2xl font-bold text-foreground">{invitations.length}</p>
          </div>
        </div>
      </div>

      {/* Search and Tabs Navigation */}
      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("active")}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition cursor-pointer ${
              activeTab === "active"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Users className="size-4" />
            <span>Active members ({members.length})</span>
          </button>

          {canInvite ? (
            <button
              type="button"
              onClick={() => setActiveTab("pending")}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition cursor-pointer ${
                activeTab === "pending"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Mail className="size-4" />
              <span>Pending invites ({invitations.length})</span>
            </button>
          ) : null}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={activeTab === "active" ? "Search members…" : "Search invitations…"}
            className="pl-9 h-9 text-sm"
          />
        </div>
      </div>

      {/* Tab 1: Active Members */}
      {activeTab === "active" || !canInvite ? (
        <div className="mt-4">
          {membersQuery.isLoading ? (
            <div className="flex h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t("loading")}
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 text-center">
              <div className="grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground mb-3">
                <Users className="size-6" />
              </div>
              <p className="font-semibold text-foreground">
                {searchQuery ? "No members match your search" : t("empty")}
              </p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                {searchQuery
                  ? "Try searching with a different name or email."
                  : "Invite colleagues to collaborate, send envelopes, and sign documents together."}
              </p>
              {!searchQuery && canInvite && (
                <Button
                  onClick={openInvite}
                  variant="outline"
                  size="sm"
                  className="mt-4 gap-2"
                >
                  <UserPlus className="size-3.5" />
                  {t("inviteMember")}
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y rounded-2xl border bg-card shadow-2xs overflow-hidden">
              {filteredMembers.map((member) => {
                const isOwner = member.role === "owner";
                const isCurrentUser = me?.id === member.id;
                const badge = roleBadge(member.role);
                const BadgeIcon = badge.icon;

                return (
                  <div
                    key={member.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 transition hover:bg-muted/40"
                  >
                    {/* Member Info Clickable */}
                    <button
                      type="button"
                      onClick={() => setSelectedMemberProfile(member)}
                      className="flex items-center gap-3 min-w-0 text-left group cursor-pointer focus:outline-none"
                      title="Click to view member profile and quick actions"
                    >
                      <Avatar className="size-10 shrink-0 border ring-1 ring-border/50 transition-transform group-hover:scale-105">
                        <AvatarFallback className="text-xs font-bold bg-primary/10 text-primary">
                          {initialsFor(member.name || member.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-foreground text-sm truncate group-hover:text-primary transition-colors flex items-center gap-1.5">
                            <span>{member.name || "Colleague"}</span>
                            <ExternalLink className="size-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                          </p>
                          {isCurrentUser && (
                            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              You
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                      </div>
                    </button>

                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                      {/* Role Badge */}
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}>
                        <BadgeIcon className="size-3" />
                        <span className="capitalize">{member.role}</span>
                      </span>

                      {/* Joined Date */}
                      <span className="text-xs text-muted-foreground hidden md:inline-block">
                        Joined {new Date(member.createdAt).toLocaleDateString()}
                      </span>

                      {/* View Profile / Actions Button */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedMemberProfile(member)}
                        className="h-8 gap-1.5 text-xs rounded-lg hidden sm:inline-flex"
                        title="View profile and actions"
                      >
                        <User className="size-3.5 text-muted-foreground" />
                        <span>{isCurrentUser ? "My Profile" : "View"}</span>
                      </Button>

                      {/* Member Actions Menu */}
                      {canManage && !isOwner && !isCurrentUser && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-muted-foreground hover:text-foreground"
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem
                              onClick={() => {
                                setTargetRole(member.role);
                                setRoleChangeMember(member);
                              }}
                              className="gap-2 cursor-pointer"
                            >
                              <Shield className="size-4 text-blue-500" />
                              <span>Change role</span>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setRemoveTarget(member)}
                              className="gap-2 text-destructive focus:text-destructive cursor-pointer"
                            >
                              <UserMinus className="size-4" />
                              <span>{t("actions.remove")}</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Tab 2: Pending Invitations */
        <div className="mt-4">
          {invitationsQuery.isLoading ? (
            <div className="flex h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading invitations…
            </div>
          ) : filteredInvitations.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 text-center">
              <div className="grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground mb-3">
                <Mail className="size-6" />
              </div>
              <p className="font-semibold text-foreground">
                {searchQuery ? "No invitations match your search" : "No pending invitations"}
              </p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                {searchQuery
                  ? "Try searching with another email."
                  : "Invitations you send to colleagues will appear here until they accept."}
              </p>
              {!searchQuery && canInvite && (
                <Button
                  onClick={openInvite}
                  variant="outline"
                  size="sm"
                  className="mt-4 gap-2"
                >
                  <UserPlus className="size-3.5" />
                  {t("inviteMember")}
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y rounded-2xl border bg-card shadow-2xs overflow-hidden">
              {filteredInvitations.map((inv) => (
                <div
                  key={inv.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 transition hover:bg-muted/40"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="grid size-10 shrink-0 place-items-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      <Mail className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground text-sm truncate">{inv.email}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">
                          Sent {new Date(inv.createdAt).toLocaleDateString()}
                        </span>
                        <span className="text-muted-foreground/40">•</span>
                        <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          <Clock className="size-3" />
                          Expires {new Date(inv.expiresAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-600 dark:text-blue-400 border border-blue-500/20 capitalize">
                      {inv.role}
                    </span>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyInviteLink(inv.token, inv.id)}
                      className="gap-1.5 h-8 text-xs"
                      title="Copy invitation link"
                    >
                      <Copy className="size-3" />
                      <span>{copiedTokenId === inv.id ? "Copied" : "Copy link"}</span>
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleResendInvite(inv)}
                      className="gap-1.5 h-8 text-xs"
                      title="Resend invitation email"
                    >
                      <RotateCw className="size-3" />
                      <span>Resend</span>
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleRevokeInvite(inv)}
                      className="gap-1.5 h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                      title="Revoke invitation"
                    >
                      <Trash2 className="size-3" />
                      <span>Revoke</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal 1: Invite Member Dialog */}
      <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
        <DialogContent className="sm:max-w-2xl p-6">
          <DialogHeader className="space-y-3 pb-2 border-b border-border/60">
            <div className="flex items-start gap-3.5">
              <div className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary shrink-0 border border-primary/20 shadow-2xs">
                <UserPlus className="size-5" />
              </div>
              <div className="space-y-1">
                <DialogTitle className="text-base font-semibold text-foreground">
                  {t("inviteDialog.title")}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
                  {t("inviteDialog.description")}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={handleSendInvite} className="space-y-4 pt-1">
            {inviteError ? (
              <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="size-4 shrink-0" />
                <span>{inviteError}</span>
              </div>
            ) : null}

            {/* Email Input with inner icon */}
            <div className="space-y-1.5">
              <Label htmlFor="invite-email" className="text-xs font-semibold text-foreground">
                {t("inviteDialog.email")}
              </Label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="invite-email"
                  type="email"
                  required
                  placeholder="colleague@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="pl-10 h-10 text-sm rounded-xl"
                  autoFocus
                />
              </div>
            </div>

            {/* Role Selection with Interactive Cards */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-foreground">
                  {t("inviteDialog.role")}
                </Label>
                <span className="text-[11px] text-muted-foreground">Select workspace access level</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {ROLE_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const selected = inviteRole === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setInviteRole(option.value)}
                      className={`flex flex-col text-left p-3.5 rounded-xl border transition-all cursor-pointer relative ${
                        selected
                          ? "border-primary bg-primary/[0.04] ring-1 ring-primary/30 shadow-xs"
                          : "border-border/80 bg-card hover:border-border hover:bg-muted/30"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1.5">
                        <div className="flex items-center gap-2">
                          <div className={`grid size-7 place-items-center rounded-lg ${selected ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                            <Icon className="size-3.5" />
                          </div>
                          <span className="font-semibold text-sm text-foreground">{option.label}</span>
                        </div>
                        <div
                          className={`size-4 rounded-full border grid place-items-center transition-all ${
                            selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"
                          }`}
                        >
                          {selected && <Check className="size-2.5 stroke-[3]" />}
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug">{option.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Info notice about expiry */}
            <div className="flex items-start gap-2.5 rounded-xl border border-border/70 bg-muted/40 p-2.5 text-[11px] text-muted-foreground">
              <Clock className="size-3.5 text-primary shrink-0 mt-0.5" />
              <span>
                An invitation email will be generated with a secure <strong>7-day expiration</strong>. You can also copy the link directly from Pending Invites.
              </span>
            </div>

            {/* Dialog Footer */}
            <DialogFooter className="gap-2 sm:gap-2.5 pt-3 border-t border-border/60">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsInviteOpen(false)}
                disabled={isInviting}
                className="rounded-xl h-9 text-xs"
              >
                {t("inviteDialog.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={isInviting}
                className="gap-2 rounded-xl h-9 text-xs shadow-xs"
              >
                {isInviting ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                {t("inviteDialog.send")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal 2: Change Role Dialog */}
      <Dialog open={Boolean(roleChangeMember)} onOpenChange={(open) => !open && setRoleChangeMember(null)}>
        <DialogContent className="sm:max-w-md p-6">
          <DialogHeader className="space-y-3 pb-2 border-b border-border/60">
            <div className="flex items-start gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0 border border-blue-500/20 shadow-2xs">
                <Shield className="size-5" />
              </div>
              <div className="space-y-0.5">
                <DialogTitle className="text-base font-semibold text-foreground">
                  Change member role
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Update workspace access for <strong>{roleChangeMember?.name}</strong> ({roleChangeMember?.email}).
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3 pt-1">
            <Label className="text-xs font-semibold text-foreground">Select new role</Label>
            <div className="grid grid-cols-1 gap-2">
              {ROLE_OPTIONS.map((option) => {
                const Icon = option.icon;
                const selected = targetRole === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setTargetRole(option.value)}
                    className={`flex items-start justify-between p-3 rounded-xl border text-left transition cursor-pointer ${
                      selected ? "border-primary bg-primary/[0.04] ring-1 ring-primary/30" : "border-border/80 hover:bg-muted/30"
                    }`}
                  >
                    <div className="space-y-0.5">
                      <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Icon className="size-3.5 text-muted-foreground" />
                        <span>{option.label}</span>
                      </p>
                      <p className="text-[11px] text-muted-foreground">{option.description}</p>
                    </div>
                    {selected && <Check className="size-4 text-primary shrink-0 mt-0.5" />}
                  </button>
                );
              })}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2.5 pt-3 border-t border-border/60">
            <Button
              variant="outline"
              onClick={() => setRoleChangeMember(null)}
              disabled={isUpdatingRole}
              className="rounded-xl h-9 text-xs"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateRole}
              disabled={isUpdatingRole}
              className="gap-2 rounded-xl h-9 text-xs shadow-xs"
            >
              {isUpdatingRole ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal 3: Remove Member Confirmation Dialog */}
      <Dialog open={Boolean(removeTarget)} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <DialogContent className="sm:max-w-md p-6">
          <DialogHeader className="space-y-3 pb-2 border-b border-border/60">
            <div className="flex items-start gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-destructive/10 text-destructive shrink-0 border border-destructive/20 shadow-2xs">
                <UserMinus className="size-5" />
              </div>
              <div className="space-y-0.5">
                <DialogTitle className="text-base font-semibold text-destructive">
                  Remove team member
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Are you sure you want to remove <strong>{removeTarget?.name}</strong> ({removeTarget?.email}) from this workspace?
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <p className="text-xs text-muted-foreground leading-relaxed pt-1">
            This member will immediately lose access to team envelopes, templates, and shared documents. They can be reinvited at any time.
          </p>

          <DialogFooter className="gap-2 sm:gap-2.5 pt-3 border-t border-border/60">
            <Button
              variant="outline"
              onClick={() => setRemoveTarget(null)}
              disabled={isRemoving}
              className="rounded-xl h-9 text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemoveMember}
              disabled={isRemoving}
              className="gap-2 rounded-xl h-9 text-xs shadow-xs"
            >
              {isRemoving ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Remove member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal 4: Member Profile & Awesome Actions Dialog */}
      <Dialog open={Boolean(selectedMemberProfile)} onOpenChange={(open) => !open && setSelectedMemberProfile(null)}>
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden border border-border/80 shadow-2xl rounded-2xl">
          {/* Decorative Header Banner */}
          <div className="relative bg-gradient-to-br from-primary/15 via-primary/5 to-muted/30 px-6 pt-6 pb-4 border-b border-border/60">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <Avatar className="size-16 border-2 border-background shadow-md ring-2 ring-primary/20">
                  <AvatarFallback className="text-lg font-bold bg-primary text-primary-foreground">
                    {initialsFor(selectedMemberProfile?.name || selectedMemberProfile?.email || "?")}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-bold text-foreground">
                      {selectedMemberProfile?.name || "Colleague"}
                    </h2>
                    {me?.id === selectedMemberProfile?.id && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary px-2 py-0.5 text-[11px] font-semibold border border-primary/20">
                        <Sparkles className="size-3" />
                        You
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 truncate">
                    <Mail className="size-3.5 text-muted-foreground/70 shrink-0" />
                    <span>{selectedMemberProfile?.email}</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Role Badge + Status Pill in Header */}
            <div className="mt-4 flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${profileBadge.className}`}>
                <ProfileBadgeIcon className="size-3.5" />
                <span className="capitalize">{selectedMemberProfile?.role}</span>
              </span>

              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                </span>
                Active
              </span>
            </div>
          </div>

          {/* Body Content */}
          <div className="p-6 space-y-5">
            {/* Workspace Details Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Joined Workspace</p>
                <p className="text-xs font-semibold text-foreground mt-1 flex items-center gap-1.5">
                  <Clock className="size-3.5 text-muted-foreground" />
                  {selectedMemberProfile?.createdAt
                    ? new Date(selectedMemberProfile.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "Active member"}
                </p>
              </div>

              <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Access Scope</p>
                <p className="text-xs font-semibold text-foreground mt-1 flex items-center gap-1.5">
                  <Shield className="size-3.5 text-primary" />
                  {profileBadge.scope}
                </p>
              </div>
            </div>

            {/* Permissions Explainer */}
            <div className="rounded-xl border border-border/80 bg-card p-3.5 space-y-1.5">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <ShieldCheck className="size-3.5 text-primary" />
                Role Permissions
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {profileBadge.permissions}
              </p>
            </div>

            {/* Awesome Action Buttons Section */}
            <div className="space-y-2 pt-1">
              <p className="text-xs font-semibold text-foreground uppercase tracking-wider text-muted-foreground">
                {me?.id === selectedMemberProfile?.id ? "Your Quick Actions" : "Member Actions"}
              </p>

              {me?.id === selectedMemberProfile?.id ? (
                /* Current User Actions */
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Button variant="outline" asChild className="justify-start gap-2 h-10 rounded-xl text-xs">
                    <Link href="/settings/profile" onClick={() => setSelectedMemberProfile(null)}>
                      <User className="size-4 text-primary" />
                      <span>Edit Profile</span>
                    </Link>
                  </Button>

                  <Button variant="outline" asChild className="justify-start gap-2 h-10 rounded-xl text-xs">
                    <Link href="/signature" onClick={() => setSelectedMemberProfile(null)}>
                      <PenTool className="size-4 text-blue-500" />
                      <span>Signature Style</span>
                    </Link>
                  </Button>

                  <Button variant="outline" asChild className="justify-start gap-2 h-10 rounded-xl text-xs">
                    <Link href="/settings/security" onClick={() => setSelectedMemberProfile(null)}>
                      <Shield className="size-4 text-amber-500" />
                      <span>Security & Sessions</span>
                    </Link>
                  </Button>

                  <Button variant="outline" asChild className="justify-start gap-2 h-10 rounded-xl text-xs">
                    <Link href="/settings/company" onClick={() => setSelectedMemberProfile(null)}>
                      <Building2 className="size-4 text-purple-500" />
                      <span>Company Settings</span>
                    </Link>
                  </Button>
                </div>
              ) : (
                /* Other Member Actions */
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      className="justify-start gap-2 h-10 rounded-xl text-xs"
                      onClick={() => {
                        window.location.href = `mailto:${selectedMemberProfile?.email}`;
                      }}
                    >
                      <Mail className="size-4 text-primary" />
                      <span>Send Email</span>
                    </Button>

                    {canManage && selectedMemberProfile?.role !== "owner" && (
                      <Button
                        variant="outline"
                        className="justify-start gap-2 h-10 rounded-xl text-xs"
                        onClick={() => {
                          const memberToChange = selectedMemberProfile;
                          setSelectedMemberProfile(null);
                          if (memberToChange) {
                            setTargetRole(memberToChange.role);
                            setRoleChangeMember(memberToChange);
                          }
                        }}
                      >
                        <Shield className="size-4 text-blue-500" />
                        <span>Change role</span>
                      </Button>
                    )}
                  </div>

                  {canManage && selectedMemberProfile?.role !== "owner" && (
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-2 h-10 rounded-xl text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
                      onClick={() => {
                        const memberToRemove = selectedMemberProfile;
                        setSelectedMemberProfile(null);
                        if (memberToRemove) {
                          setRemoveTarget(memberToRemove);
                        }
                      }}
                    >
                      <UserMinus className="size-4" />
                      <span>Remove from workspace</span>
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border/60 bg-muted/20 px-6 py-3">
            {me?.id === selectedMemberProfile?.id ? (
              <Button variant="ghost" size="sm" asChild className="gap-1.5 text-xs text-destructive hover:bg-destructive/10">
                <Link href="/auth/sign-out">
                  <LogOut className="size-3.5" />
                  <span>Sign Out</span>
                </Link>
              </Button>
            ) : (
              <span className="text-[11px] text-muted-foreground">ID: {selectedMemberProfile?.id?.slice(0, 8)}…</span>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedMemberProfile(null)}
              className="rounded-xl h-8 text-xs ml-auto"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
