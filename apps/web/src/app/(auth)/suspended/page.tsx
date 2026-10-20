"use client";

import { useAccessToken } from "@workos-inc/authkit-nextjs/components";
import { useQuery } from "@tanstack/react-query";
import { Ban, Building2, ChevronRight } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { getActiveWorkspaceId, switchWorkspace } from "@/lib/active-workspace";
import { listWorkspaces } from "@/lib/platform-api";

/** Where the web app sends people whose account or current workspace Signet staff have suspended. */
export default function SuspendedPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-surface-subtle px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border bg-card p-6 shadow-sm sm:p-8">
        <Suspense>
          <SuspendedNotice />
        </Suspense>
      </div>
    </main>
  );
}

function SuspendedNotice() {
  const account = useSearchParams().get("type") === "account";
  return (
    <div className="text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-destructive/10 text-destructive">
        <Ban className="size-6" />
      </span>
      <h1 className="mt-5 text-xl font-semibold tracking-tight">{account ? "Your account is suspended" : "This workspace is suspended"}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {account
          ? "You can't use Signet while your account is suspended. If you think this is a mistake, contact Signet support."
          : "Signet support has suspended this workspace, so nobody can use it for now. The workspace owner can contact Signet support to restore it."}
      </p>
      {account ? null : <OtherWorkspaces />}
      <Button asChild variant="outline" className="mt-6 w-full">
        {/* A plain <a>: sign-out redirects to WorkOS. */}
        <a href="/auth/sign-out">Sign out</a>
      </Button>
    </div>
  );
}

/** A suspended workspace doesn't lock people out of their other workspaces. */
function OtherWorkspaces() {
  const { getAccessToken } = useAccessToken();
  const workspaces = useQuery({
    queryKey: ["workspaces", "suspended-page"],
    queryFn: async () => {
      const token = await getAccessToken();
      return token ? listWorkspaces(token) : [];
    },
    retry: false,
  });
  const current = getActiveWorkspaceId();
  const others = (workspaces.data ?? []).filter((workspace) => !workspace.suspended && workspace.id !== current);
  if (others.length === 0) return null;
  return (
    <div className="mt-6 text-start">
      <p className="text-xs font-medium text-muted-foreground">Continue in another workspace</p>
      <ul className="mt-2 divide-y rounded-2xl border">
        {others.map((workspace) => (
          <li key={workspace.id}>
            <button type="button" onClick={() => switchWorkspace(workspace.id)} className="flex w-full items-center gap-3 px-4 py-3 text-start text-sm hover:bg-muted/60">
              <Building2 className="size-4 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-medium">{workspace.name}</span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
