"use client";

import { useAccessToken, useAuth } from "@workos-inc/authkit-nextjs/components";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Building2, Eye, Loader2, ShieldCheck, UserCheck } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { switchWorkspace } from "@/lib/active-workspace";
import { acceptInvitation, ApiError, getInvitationPreview, type WorkspaceRole } from "@/lib/platform-api";

const roleDetails: Record<WorkspaceRole, { label: string; description: string; icon: typeof UserCheck }> = {
  owner: { label: "Owner", description: "Full control of the organization.", icon: ShieldCheck },
  admin: { label: "Admin", description: "Send documents, invite people, and manage workspace settings.", icon: ShieldCheck },
  member: { label: "Member", description: "Create, send, and manage documents in the workspace.", icon: UserCheck },
  viewer: { label: "Viewer", description: "Read-only access to documents and audit trails. Can't send, edit, or delete anything.", icon: Eye },
};

export default function InvitationPage() {
  const { token } = useParams<{ token: string }>();
  const { user, loading: authLoading } = useAuth();
  const { getAccessToken } = useAccessToken();
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  const preview = useQuery({
    queryKey: ["invitation-preview", token],
    queryFn: () => getInvitationPreview(token),
    retry: false,
  });

  const returnTo = encodeURIComponent(`/invitations/${token}`);
  const invitedEmail = preview.data?.email ?? "";
  const signedInEmail = user?.email?.toLowerCase() ?? "";
  const emailMatches = Boolean(user) && signedInEmail === invitedEmail.toLowerCase();

  async function handleAccept() {
    setAccepting(true);
    setAcceptError(null);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error("Please sign in again.");
      const result = await acceptInvitation(accessToken, token);
      switchWorkspace(result.workspace.id);
    } catch (err) {
      setAcceptError(err instanceof ApiError || err instanceof Error ? err.message : "Unable to accept invitation.");
      setAccepting(false);
    }
  }

  let body: React.ReactNode;
  if (preview.isLoading || authLoading) {
    body = (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading invitation…
      </div>
    );
  } else if (preview.isError || !preview.data) {
    body = <Notice title="Invitation not found" text="This link is invalid. Ask the person who invited you to send a new invitation." />;
  } else if (preview.data.status !== "pending") {
    const reason = preview.data.status === "accepted" ? "has already been accepted" : preview.data.status === "expired" ? "has expired" : "was revoked";
    body = (
      <Notice title="Invitation unavailable" text={`This invitation ${reason}. Ask ${preview.data.inviterName || "the organization"} to send a new one if you still need access.`}>
        {user ? <Button asChild className="mt-5"><Link href="/dashboard">Go to dashboard</Link></Button> : null}
      </Notice>
    );
  } else {
    const role = roleDetails[preview.data.role] ?? roleDetails.member;
    const RoleIcon = role.icon;
    body = (
      <>
        <div className="text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary"><Building2 className="size-7" /></div>
          <h1 className="mt-4 text-xl font-semibold tracking-tight">Join {preview.data.organizationName}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            <strong className="text-foreground">{preview.data.inviterName}</strong> invited <strong className="text-foreground">{invitedEmail}</strong> to this organization.
          </p>
        </div>

        <div className="mt-6 flex items-start gap-3 rounded-2xl border bg-muted/30 p-4">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-background text-primary shadow-2xs"><RoleIcon className="size-4" /></div>
          <div>
            <p className="text-sm font-semibold">Role: {role.label}</p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{role.description}</p>
          </div>
        </div>

        {acceptError ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" /> <span>{acceptError}</span>
          </div>
        ) : null}

        <div className="mt-6 space-y-3">
          {!user ? (
            <>
              <Button asChild className="w-full"><a href={`/auth/sign-in?returnTo=${returnTo}&email=${encodeURIComponent(invitedEmail)}`}>I already have an account — sign in</a></Button>
              <Button asChild variant="outline" className="w-full"><a href={`/auth/sign-up?returnTo=${returnTo}&email=${encodeURIComponent(invitedEmail)}`}>Create an account</a></Button>
              <p className="text-center text-xs text-muted-foreground">Use {invitedEmail} so the invitation matches your account.</p>
            </>
          ) : emailMatches ? (
            <Button className="w-full" disabled={accepting} onClick={() => void handleAccept()}>
              {accepting ? <Loader2 className="size-4 animate-spin" /> : null} Accept and join
            </Button>
          ) : (
            <>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
                You&apos;re signed in as <strong>{user.email}</strong>, but this invitation is for <strong>{invitedEmail}</strong>. Sign out and sign in with the invited email.
              </div>
              <Button asChild variant="outline" className="w-full"><a href="/auth/sign-out">Sign out</a></Button>
            </>
          )}
        </div>
      </>
    );
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-surface-subtle px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border bg-card p-6 shadow-sm sm:p-8">{body}</div>
    </main>
  );
}

function Notice({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="py-4 text-center">
      <AlertCircle className="mx-auto size-8 text-muted-foreground" />
      <h1 className="mt-4 text-lg font-semibold">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
      {children}
    </div>
  );
}
