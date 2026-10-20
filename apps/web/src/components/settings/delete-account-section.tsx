"use client";

import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAccountDeletion, useCancelAccountDeletion, useRequestAccountDeletion } from "@/hooks/use-envelope-api";

const longDate = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long", day: "numeric" });

/** Lets a person delete their own Signet account, 30 days after they ask. */
export function DeleteAccountSection({ email }: { email: string }) {
  const deletion = useAccountDeletion();
  const request = useRequestAccountDeletion();
  const cancel = useCancelAccountDeletion();
  const [confirm, setConfirm] = useState("");
  const pending = deletion.data?.request;
  const graceDays = deletion.data?.graceDays ?? 30;
  const error = request.error ?? cancel.error;

  return (
    <section className="mt-6 rounded-[2rem] border border-destructive/30 bg-card p-6 shadow-sm sm:p-8">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive">
          <Trash2 className="size-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold">Delete your account</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {graceDays} days after you ask, workspaces only you use are deleted with all their documents, you&apos;re removed from the others, and your sign-in is removed. Envelopes you sent in shared workspaces stay with those
            workspaces. You can cancel until then.
          </p>
        </div>
      </div>

      <div className="mt-5">
        {deletion.isLoading ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : pending ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center">
            <AlertTriangle className="size-5 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold">Your account will be deleted on {longDate.format(new Date(pending.scheduledFor))}</p>
              <p className="text-muted-foreground">
                Export anything you want to keep first, in{" "}
                <Link href="/settings/data" className="font-semibold text-primary">
                  Data &amp; privacy
                </Link>
                .
              </p>
            </div>
            <Button variant="outline" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
              {cancel.isPending ? <Loader2 className="animate-spin" /> : null} Keep my account
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block text-sm" htmlFor="confirm-account-delete">
              Type your email, <strong>{email}</strong>, to confirm
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input id="confirm-account-delete" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="off" className="sm:max-w-sm" />
              <Button variant="destructive" disabled={confirm.trim().toLowerCase() !== email.toLowerCase() || request.isPending} onClick={() => request.mutate(confirm, { onSuccess: () => setConfirm("") })}>
                {request.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />} Schedule deletion
              </Button>
            </div>
          </div>
        )}
        {error ? <p className="mt-3 text-sm text-destructive">{error.message}</p> : null}
      </div>
    </section>
  );
}
