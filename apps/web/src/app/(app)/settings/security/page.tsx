"use client";

import { CheckCircle2, CircleAlert, KeyRound, Laptop, Loader2, LogOut, Mail, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { useAccountSecurity, useRevokeOtherSessions, useRevokeSession, useSendPasswordReset } from "@/hooks/use-envelope-api";
import type { AccountSecurity } from "@/lib/platform-api";

// Sign-in runs on WorkOS, so everything here is read from and changed in WorkOS: whether the account has
// an authenticator app, which devices are signed in, and password resets (by email link).

const dateTime = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const day = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long", day: "numeric" });

const authMethods: Record<string, string> = {
  password: "Password",
  passkey: "Passkey",
  magic_code: "Email code",
  sso: "Company single sign-on",
  oauth: "Google, Microsoft or similar account",
  google_oauth: "Google",
  microsoft_oauth: "Microsoft",
  github_oauth: "GitHub",
  apple_oauth: "Apple",
  impersonation: "Signet support",
};

const describeMethod = (method: string) => authMethods[method] ?? (method ? method.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "");

// Signing in through another provider means the password lives there, not with Signet.
const providerSignIn = (method: string | undefined) => Boolean(method && (method === "sso" || method.includes("oauth")));

/** A short device description from a user agent, e.g. "Chrome on Windows". */
function describeDevice(userAgent: string) {
  if (!userAgent) return "Unknown device";
  const browser = /Edg\//.test(userAgent) ? "Edge" : /OPR\//.test(userAgent) ? "Opera" : /Firefox\//.test(userAgent) ? "Firefox" : /Chrome\//.test(userAgent) ? "Chrome" : /Safari\//.test(userAgent) ? "Safari" : "Browser";
  const os = /Windows/.test(userAgent) ? "Windows" : /iPhone|iPad/.test(userAgent) ? "iOS" : /Mac OS X/.test(userAgent) ? "macOS" : /Android/.test(userAgent) ? "Android" : /Linux/.test(userAgent) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

function Card({ icon: Icon, title, description, actions, children }: { icon: typeof KeyRound; title: string; description: string; actions?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <section className="rounded-3xl border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-subtle text-muted-foreground"><Icon className="size-4" /></span>
        <div className="flex-1">
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
        {actions}
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </section>
  );
}

function ErrorLine({ error }: { error: unknown }) {
  if (!error) return null;
  return <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-destructive"><CircleAlert className="mt-0.5 size-4 shrink-0" />{error instanceof Error ? error.message : "Something went wrong."}</p>;
}

function PasswordCard({ canEmail, signInMethod }: { canEmail: boolean; signInMethod?: string }) {
  const reset = useSendPasswordReset();
  if (providerSignIn(signInMethod)) {
    return (
      <Card
        icon={KeyRound}
        title="Password"
        description={`You signed in with ${signInMethod === "sso" ? "your company's single sign-on" : "your Google, Microsoft or similar account"}, so your password is managed there, not by Signet. To change it, change it with that provider.`}
      />
    );
  }
  return (
    <Card
      icon={KeyRound}
      title="Password"
      description="To change your password, we email you a secure link. That way nobody using a signed-in device can change it without access to your inbox."
      actions={
        <Button variant="outline" disabled={!canEmail || reset.isPending || reset.isSuccess} onClick={() => reset.mutate()}>
          {reset.isPending ? <Loader2 className="animate-spin" /> : <Mail />}
          {reset.isSuccess ? "Link sent" : "Email me a reset link"}
        </Button>
      }
    >
      {reset.isSuccess ? (
        <p role="status" className="flex items-start gap-2 rounded-2xl bg-emerald-500/5 p-3 text-sm"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />We sent a link to {reset.data.sentTo}. It works once and expires soon.</p>
      ) : !canEmail ? (
        <p className="text-sm text-muted-foreground">Email isn&apos;t set up on this server, so reset links can&apos;t be sent. Use &ldquo;Forgot password&rdquo; on the sign-in page instead.</p>
      ) : null}
      <ErrorLine error={reset.error} />
    </Card>
  );
}

function TwoFactorCard({ twoFactor, signInMethod }: { twoFactor: AccountSecurity["twoFactor"]; signInMethod?: string }) {
  const enabled = twoFactor.enabled;
  if (!enabled && providerSignIn(signInMethod)) {
    const provider = signInMethod === "sso" ? "your company's sign-in" : "your Google, Microsoft or similar account";
    return (
      <Card
        icon={ShieldCheck}
        title="Two-factor authentication"
        description={`You sign in with ${provider}, so two-step verification is handled there. Turn it on in that account's security settings to protect your Signet sign-in too.`}
      />
    );
  }
  return (
    <Card
      icon={enabled ? ShieldCheck : ShieldOff}
      title="Two-factor authentication"
      description={enabled ? "Signing in asks for a code from your authenticator app as well as your password." : "Signing in only needs your password or sign-in method."}
      actions={<span className={`h-fit rounded-full px-2.5 py-1 text-xs font-semibold ${enabled ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>{enabled ? "On" : "Off"}</span>}
    >
      {enabled ? (
        <ul className="space-y-2">
          {twoFactor.factors.map((factor) => (
            <li key={factor.id} className="flex items-center gap-3 rounded-2xl bg-surface-subtle/70 p-3 text-sm">
              <Smartphone className="size-4 text-muted-foreground" />
              <span className="flex-1">{factor.type === "totp" ? "Authenticator app" : factor.type}</span>
              <span className="text-xs text-muted-foreground">Added {day.format(new Date(factor.createdAt))}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Signet turns on two-factor sign-in for every account at once. Once it&apos;s on, you&apos;ll be asked to set up an authenticator app the next time you sign in.</p>
      )}
    </Card>
  );
}

function SessionsCard({ sessions }: { sessions: AccountSecurity["sessions"] }) {
  const revoke = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();
  const others = sessions.filter((session) => !session.current).length;
  const sorted = [...sessions].sort((a, b) => Number(b.current) - Number(a.current) || b.updatedAt.localeCompare(a.updatedAt));
  return (
    <Card
      icon={Laptop}
      title="Signed-in devices"
      description="Where your account is signed in right now. Sign out any device you don't recognize."
      actions={others ? (
        <Button variant="outline" disabled={revokeOthers.isPending} onClick={() => revokeOthers.mutate()}>
          {revokeOthers.isPending ? <Loader2 className="animate-spin" /> : <LogOut />}
          Sign out other devices
        </Button>
      ) : null}
    >
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active sessions found.</p>
      ) : (
        <ul className="divide-y rounded-2xl border">
          {sorted.map((session) => (
            <li key={session.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 font-medium">
                  {describeDevice(session.userAgent)}
                  {session.current ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">This device</span> : null}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {[session.ipAddress, describeMethod(session.authMethod), `signed in ${dateTime.format(new Date(session.createdAt))}`].filter(Boolean).join(" · ")}
                </span>
              </span>
              {!session.current ? (
                <Button variant="ghost" size="sm" disabled={revoke.isPending && revoke.variables === session.id} onClick={() => revoke.mutate(session.id)}>
                  {revoke.isPending && revoke.variables === session.id ? <Loader2 className="animate-spin" /> : null}
                  Sign out
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {revokeOthers.isSuccess ? <p role="status" className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">Signed out {revokeOthers.data.revoked} {revokeOthers.data.revoked === 1 ? "device" : "devices"}.</p> : null}
      <ErrorLine error={revoke.error ?? revokeOthers.error} />
    </Card>
  );
}

export default function SecuritySettingsPage() {
  const security = useAccountSecurity();
  return (
    <div className="space-y-6 pb-10">
      <PageHeader eyebrow="Account settings" title="Security" description="Your password, two-factor sign-in and signed-in devices." />
      {security.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading security settings…</p>
      ) : security.error ? (
        <section className="rounded-3xl border bg-card p-6 text-center shadow-sm">
          <CircleAlert className="mx-auto size-6 text-destructive" />
          <p className="mt-3 font-medium">Couldn&apos;t load your security settings</p>
          <p className="mt-1 text-sm text-muted-foreground">{security.error instanceof Error ? security.error.message : "Try again in a moment."}</p>
          <Button variant="outline" className="mt-4" onClick={() => void security.refetch()}>Try again</Button>
        </section>
      ) : security.data ? (
        <>
          <PasswordCard canEmail={security.data.passwordResetEmail} signInMethod={security.data.sessions.find((session) => session.current)?.authMethod} />
          <TwoFactorCard twoFactor={security.data.twoFactor} signInMethod={security.data.sessions.find((session) => session.current)?.authMethod} />
          <SessionsCard sessions={security.data.sessions} />
        </>
      ) : null}
    </div>
  );
}
