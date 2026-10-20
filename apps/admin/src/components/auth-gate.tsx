import { useAuth } from "@workos-inc/authkit-react";
import { ArrowRight, CircleAlert, LoaderCircle, ShieldAlert, WifiOff } from "lucide-react";
import { type ReactNode } from "react";
import { useLocation } from "react-router";

import { Button } from "@signet/ui/components/button";

import { AuthHeading, AuthScreen } from "@/components/auth-screen";
import { AdminContext } from "@/lib/admin-context";
import { ApiError, useMe } from "@/lib/api";

function StateIcon({ children, tone }: { children: ReactNode; tone: "danger" | "warning" }) {
  const classes = tone === "danger" ? "bg-destructive/10 text-destructive ring-destructive/20" : "bg-amber-500/10 text-amber-700 ring-amber-600/20 dark:text-amber-300";
  return <span className={`mb-6 grid size-12 place-items-center rounded-2xl ring-1 ring-inset ${classes}`}>{children}</span>;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { isLoading, user, signIn, signOut } = useAuth();
  const location = useLocation();
  const me = useMe(Boolean(user));

  if (isLoading || (user && me.isPending)) {
    return (
      <AuthScreen>
        <div className="flex flex-col items-center text-center" role="status">
          <LoaderCircle className="size-6 animate-spin text-primary" />
          <p className="mt-4 font-medium">Checking your access…</p>
          <p className="mt-1 text-sm text-muted-foreground">Verifying your session and admin role.</p>
        </div>
      </AuthScreen>
    );
  }

  if (!user) {
    // Landing here on /callback means the code exchange with WorkOS failed. Never send people back to the
    // callback URL after signing in, or the URL nests on every retry.
    const failedCallback = location.pathname === "/callback";
    const returnTo = failedCallback ? "/" : location.pathname + location.search;
    return (
      <AuthScreen>
        <AuthHeading title="Sign in" description="Use your Signet staff account." />
        {failedCallback ? (
          <p role="alert" className="mt-6 flex gap-2.5 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            Sign-in didn&apos;t complete. Please try again.
          </p>
        ) : null}
        <Button size="lg" className="group mt-8 h-12 w-full text-base" onClick={() => void signIn({ state: { returnTo } })}>
          Continue
          <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
        </Button>
      </AuthScreen>
    );
  }

  if (me.error) {
    const notAdmin = me.error instanceof ApiError && me.error.status === 403;
    return (
      <AuthScreen>
        {notAdmin ? (
          <AuthHeading
            icon={
              <StateIcon tone="danger">
                <ShieldAlert className="size-5" />
              </StateIcon>
            }
            title="No admin access"
            description={
              <>
                <span className="font-medium text-foreground">{user.email}</span> is signed in but isn&apos;t a platform admin. Ask a super admin to grant you a role, or sign in with a different account.
              </>
            }
          />
        ) : (
          <AuthHeading
            icon={
              <StateIcon tone="warning">
                <WifiOff className="size-5" />
              </StateIcon>
            }
            title="Can't reach the API"
            description={<>You&apos;re signed in, but the admin API didn&apos;t respond ({me.error.message}). Check that the API is running, then try again.</>}
          />
        )}
        <div className="mt-8 grid gap-2">
          {notAdmin ? null : (
            <Button size="lg" className="h-12" onClick={() => void me.refetch()}>
              Try again
            </Button>
          )}
          <Button size="lg" variant={notAdmin ? "default" : "outline"} className="h-12" onClick={() => signOut({ returnTo: window.location.origin })}>
            {notAdmin ? "Sign in with a different account" : "Sign out"}
          </Button>
        </div>
      </AuthScreen>
    );
  }

  return <AdminContext.Provider value={me.data ?? null}>{children}</AdminContext.Provider>;
}
