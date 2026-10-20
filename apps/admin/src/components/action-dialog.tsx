import { CheckCircle2, CircleAlert, LoaderCircle, X } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@signet/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@signet/ui/components/dialog";
import { Label } from "@signet/ui/components/label";
import { Textarea } from "@signet/ui/components/textarea";
import { cn } from "@signet/ui/lib/utils";

import { useAdminAction, type AdminRequest } from "@/lib/api";

export type ActionSpec<T = unknown> = {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  /** Red confirm button for changes that take something away. */
  destructive?: boolean;
  /** Reasons are required for anything that changes or removes data; optional for resends. */
  reasonRequired?: boolean;
  reasonPlaceholder?: string;
  /** Extra inputs (a role picker, an email field) shown above the reason. */
  fields?: ReactNode;
  /** False while the extra inputs aren't filled in. */
  ready?: boolean;
  request: (reason: string) => AdminRequest;
  success: (result: T) => string;
};

/** A confirm dialog that collects a reason, sends one admin request and reports the result. */
export function ActionDialog<T>({ spec, onClose, onDone }: { spec: ActionSpec<T> | null; onClose: () => void; onDone: (message: string) => void }) {
  return (
    <Dialog open={spec !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">{spec ? <ActionForm key={spec.title} spec={spec} onClose={onClose} onDone={onDone} /> : null}</DialogContent>
    </Dialog>
  );
}

function ActionForm<T>({ spec, onClose, onDone }: { spec: ActionSpec<T>; onClose: () => void; onDone: (message: string) => void }) {
  const action = useAdminAction<T>();
  const [reason, setReason] = useState("");
  const required = spec.reasonRequired ?? true;
  const canSubmit = !action.isPending && (spec.ready ?? true) && (!required || reason.trim().length > 0);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    action.mutate(spec.request(reason.trim()), {
      onSuccess: (result) => {
        onDone(spec.success(result));
        onClose();
      },
    });
  };

  return (
    <form onSubmit={submit} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      <DialogHeader>
        <DialogTitle>{spec.title}</DialogTitle>
        <DialogDescription>{spec.description}</DialogDescription>
      </DialogHeader>

      {spec.fields}

      <div className="grid gap-2">
        <Label htmlFor="action-reason">{required ? "Reason" : "Note (optional)"}</Label>
        <Textarea id="action-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder={spec.reasonPlaceholder} maxLength={500} rows={3} required={required} />
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
        <Button type="submit" disabled={!canSubmit} className={cn(spec.destructive && "bg-destructive text-white hover:bg-destructive/90 dark:bg-destructive dark:hover:bg-destructive/90")}>
          {action.isPending ? <LoaderCircle className="animate-spin" /> : null}
          {spec.confirmLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Green confirmation banner shown after an action succeeds. */
export function Notice({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  if (!message) return null;
  return (
    <div role="status" className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
      <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
      <p className="flex-1 font-medium">{message}</p>
      <Button variant="ghost" size="icon-xs" aria-label="Dismiss" onClick={onDismiss}>
        <X />
      </Button>
    </div>
  );
}
