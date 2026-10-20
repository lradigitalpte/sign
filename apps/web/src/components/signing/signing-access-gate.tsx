"use client";

import { KeyRound, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, getSigningSession, verifySigningPasscode, type SigningSession } from "@/lib/platform-api";

/**
 * Asks for the envelope passcode before rendering the signing screens.
 * The API withholds documents and fields until this link is unlocked, so the pages below only mount afterwards.
 */
export function SigningAccessGate({ token, children }: { token: string; children: ReactNode }) {
  const t = useTranslations("RecipientSigning");
  const [locked, setLocked] = useState<SigningSession | null>(null);
  const [checking, setChecking] = useState(true);
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSigningSession(token)
      .then((session) => {
        if (!cancelled) setLocked(session.locked ? session : null);
      })
      // Invalid or revoked links fall through to the page, which already explains those errors.
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!passcode.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await verifySigningPasscode(token, passcode);
      setLocked(null);
    } catch (caught) {
      const code = caught instanceof ApiError ? (caught.payload as { code?: string } | undefined)?.code : undefined;
      setError(code === "passcode_locked" ? t("passcodeLocked") : code === "passcode_incorrect" ? t("passcodeIncorrect") : t("loadError"));
      setPasscode("");
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) {
    return (
      <main className="grid flex-1 place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </main>
    );
  }
  if (!locked) return <>{children}</>;

  return (
    <main className="grid flex-1 place-items-center px-4 py-12">
      <form onSubmit={submit} className="clay-panel w-full max-w-sm rounded-3xl p-6 sm:p-7">
        {locked.organizationBrand.logoDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={locked.organizationBrand.logoDataUrl} alt={locked.organizationName} className="h-8 max-w-[180px] object-contain" />
        ) : (
          <span className="grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary">
            <KeyRound className="size-5" />
          </span>
        )}
        <h1 className="mt-5 text-xl font-bold">{t("passcodeTitle")}</h1>
        <p className="mt-1 text-sm font-medium">{locked.envelope.title}</p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("passcodeDesc", { organization: locked.organizationName })}</p>
        <div className="mt-6 grid gap-2">
          <Label htmlFor="signing-passcode">{t("passcodeLabel")}</Label>
          <Input
            id="signing-passcode"
            type="password"
            autoComplete="one-time-code"
            autoFocus
            value={passcode}
            onChange={(event) => setPasscode(event.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "signing-passcode-error" : undefined}
          />
          {error ? (
            <p id="signing-passcode-error" role="alert" className="text-xs font-medium text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <Button type="submit" size="lg" className="mt-5 w-full" disabled={submitting || !passcode.trim()}>
          {submitting ? <Loader2 className="animate-spin" /> : null}
          {t("passcodeSubmit")}
        </Button>
        {!locked.organizationBrand.hidePlatformBranding ? (
          <p className="mt-5 text-center text-[11px] text-muted-foreground">Powered by Secure Sign</p>
        ) : null}
      </form>
    </main>
  );
}
