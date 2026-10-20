import { CircleAlert, LoaderCircle } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "@signet/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@signet/ui/components/dialog";
import { Input } from "@signet/ui/components/input";
import { Label } from "@signet/ui/components/label";
import { Textarea } from "@signet/ui/components/textarea";
import { cn } from "@signet/ui/lib/utils";

import { useEnvelopeAction, type EnvelopeActionResult } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { EnvelopeDetail } from "@/lib/types";

export type EnvelopeActionKind = "resend" | "extend" | "void";

const DAY = 24 * 60 * 60 * 1000;

/** yyyy-mm-dd in local time, for <input type="date">. */
function toDateInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The chosen day ends at 23:59 local time, so "expires on the 20th" includes the 20th. */
function endOfDay(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 23, 59, 0);
}

function waitingCount(envelope: EnvelopeDetail) {
  return envelope.recipients.filter((r) => r.role !== "cc" && (r.status === "sent" || r.status === "viewed")).length;
}

export function EnvelopeActionDialog({
  envelope,
  kind,
  onClose,
  onDone,
}: {
  envelope: EnvelopeDetail;
  kind: EnvelopeActionKind | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  return (
    <Dialog open={kind !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">{kind ? <ActionForm key={kind} envelope={envelope} kind={kind} onClose={onClose} onDone={onDone} /> : null}</DialogContent>
    </Dialog>
  );
}

function ActionForm({ envelope, kind, onClose, onDone }: { envelope: EnvelopeDetail; kind: EnvelopeActionKind; onClose: () => void; onDone: (message: string) => void }) {
  const action = useEnvelopeAction(envelope.id);
  const [reason, setReason] = useState("");

  // Extensions count from the later of today and the current expiration, fixed when the dialog opens.
  const [base] = useState(() => Math.max(Date.now(), envelope.expiresAt ? new Date(envelope.expiresAt).getTime() : 0));
  const [date, setDate] = useState(() => toDateInput(new Date(base + 7 * DAY)));
  const presets = [7, 14, 30].map((days) => ({ days, value: toDateInput(new Date(base + days * DAY)) }));

  const waiting = waitingCount(envelope);
  const reasonRequired = kind !== "resend";
  const copy = {
    resend: {
      title: "Resend signing emails",
      description: `${waiting} ${waiting === 1 ? "recipient" : "recipients"} still waiting will get a reminder with a fresh signing link.`,
      submit: "Resend emails",
      reasonLabel: "Note (optional)",
      placeholder: "e.g. Customer says the first email went to spam",
    },
    extend: {
      title: envelope.status === "expired" ? "Reopen and extend" : "Extend expiration",
      description:
        envelope.status === "expired"
          ? "This envelope expired. Extending it reopens it, and recipients can use their existing links again."
          : `${envelope.expiresAt ? `It currently expires on ${formatDate(envelope.expiresAt)}. ` : ""}Recipients' existing links stay valid until the new date.`,
      submit: envelope.status === "expired" ? "Reopen envelope" : "Extend",
      reasonLabel: "Reason",
      placeholder: "e.g. Signer was travelling and asked for more time",
    },
    void: {
      title: "Void this envelope?",
      description: "Nobody will be able to sign it, and every signing link stops working. The sender sees it was voided by Signet support. This can't be undone.",
      submit: "Void envelope",
      reasonLabel: "Reason",
      placeholder: "e.g. Sender asked us to cancel it; sent to the wrong person",
    },
  }[kind];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    action.mutate(kind === "extend" ? { kind, reason, expiresAt: endOfDay(date).toISOString() } : { kind, reason }, {
      onSuccess: (result: EnvelopeActionResult) => {
        onDone(
          kind === "resend"
            ? `Queued ${result.remindersQueued ?? 0} ${result.remindersQueued === 1 ? "reminder" : "reminders"}.`
            : kind === "extend"
              ? `${result.reopened ? "Reopened and extended" : "Extended"} to ${formatDate(result.expiresAt ?? endOfDay(date).toISOString())}.`
              : "Envelope voided.",
        );
        onClose();
      },
    });
  };

  const canSubmit = !action.isPending && (!reasonRequired || reason.trim().length > 0) && (kind !== "extend" || Boolean(date));

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{copy.title}</DialogTitle>
        <DialogDescription>{copy.description}</DialogDescription>
      </DialogHeader>

      {kind === "extend" ? (
        <div className="grid gap-2">
          <Label htmlFor="expires-on">New expiration date</Label>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((preset) => (
              <button
                key={preset.days}
                type="button"
                onClick={() => setDate(preset.value)}
                className={cn(
                  "h-7 rounded-full border px-3 text-xs font-medium transition-colors",
                  date === preset.value ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                +{preset.days} days
              </button>
            ))}
          </div>
          <Input id="expires-on" type="date" value={date} min={toDateInput(new Date(base + DAY))} onChange={(event) => setDate(event.target.value)} required />
        </div>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="action-reason">{copy.reasonLabel}</Label>
        <Textarea
          id="action-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={copy.placeholder}
          maxLength={500}
          rows={3}
          required={reasonRequired}
        />
        <p className="text-xs text-muted-foreground">Saved in the admin audit log. Customers don&apos;t see it.</p>
      </div>

      {action.error ? (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          {action.error.message}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!canSubmit}
          className={cn(kind === "void" && "bg-destructive text-white hover:bg-destructive/90 dark:bg-destructive dark:hover:bg-destructive/90")}
        >
          {action.isPending ? <LoaderCircle className="animate-spin" /> : null}
          {copy.submit}
        </Button>
      </DialogFooter>
    </form>
  );
}
