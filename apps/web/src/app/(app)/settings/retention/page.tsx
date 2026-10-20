"use client";

import { Archive, Check, Loader2, Lock, Trash2 } from "lucide-react";
import { useState } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { useMe, useUpdateWorkspaceSettings, useWorkspaceSettings } from "@/hooks/use-envelope-api";
import { cn } from "@/lib/utils";

const PERIODS = [3, 6, 12, 24, 36, 60, 84, 120];

function periodLabel(months: number) {
  return months < 12 ? `${months} months` : months === 12 ? "1 year" : `${months / 12} years`;
}

function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (value: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50", checked ? "bg-primary" : "bg-muted-foreground/30")}
    >
      <span className={cn("inline-block size-5 rounded-full bg-white shadow-sm transition-transform", checked ? "translate-x-5.5" : "translate-x-0.5")} />
    </button>
  );
}

type Form = { autoDelete: boolean; retentionMonths: number; legalHold: boolean };

export default function RetentionPage() {
  const settings = useWorkspaceSettings("retention");
  const save = useUpdateWorkspaceSettings("retention");
  const role = useMe().data?.workspace.role;
  const canEdit = role === "owner" || role === "admin";
  // Only unsaved changes live in state; the rest comes from the saved settings.
  const [edits, setEdits] = useState<Partial<Form> | null>(null);
  const savedMonths = Number(settings.data?.retentionMonths);
  const saved: Form = {
    autoDelete: settings.data?.autoDelete === true,
    retentionMonths: PERIODS.includes(savedMonths) ? savedMonths : 24,
    legalHold: settings.data?.legalHold === true,
  };
  const form: Form = { ...saved, ...edits };
  const dirty = edits !== null;

  const change = (patch: Partial<Form>) => {
    setEdits((current) => ({ ...current, ...patch }));
    save.reset();
  };

  const effective = form.legalHold ? "hold" : form.autoDelete ? "delete" : "keep";

  return (
    <div className="space-y-6 pb-10">
      <PageHeader eyebrow="Organisation settings" title="Retention & legal hold" description="Decide how long finished envelopes are kept. Nothing is deleted unless you turn on automatic deletion." />

      <section className="rounded-3xl border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-300">
            <Trash2 className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-sm font-semibold">Delete finished envelopes automatically</h2>
              <Toggle checked={form.autoDelete} onChange={(autoDelete) => change({ autoDelete })} disabled={!canEdit} label="Delete finished envelopes automatically" />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Completed, voided and expired envelopes are permanently deleted, with their documents, signed copies and audit trails, once they&apos;re older than the period below. Drafts and envelopes in progress are never touched.
            </p>
            <div className={cn("mt-4 flex flex-wrap gap-2", !form.autoDelete && "opacity-50")} role="radiogroup" aria-label="Keep envelopes for">
              {PERIODS.map((months) => (
                <button
                  key={months}
                  type="button"
                  role="radio"
                  aria-checked={form.retentionMonths === months}
                  disabled={!canEdit || !form.autoDelete}
                  onClick={() => change({ retentionMonths: months })}
                  className={cn("h-9 rounded-xl border px-3.5 text-sm font-medium transition-colors", form.retentionMonths === months ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground enabled:hover:bg-surface-subtle")}
                >
                  {periodLabel(months)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-300">
            <Lock className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-sm font-semibold">Legal hold</h2>
              <Toggle checked={form.legalHold} onChange={(legalHold) => change({ legalHold })} disabled={!canEdit} label="Legal hold" />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Keeps everything, no matter what: automatic deletion pauses and the workspace can&apos;t be deleted while legal hold is on.</p>
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-3 rounded-3xl border bg-surface-subtle/60 p-5 sm:flex-row sm:items-center">
        <Archive className="size-5 shrink-0 text-muted-foreground" />
        <p className="min-w-0 flex-1 text-sm">
          {effective === "hold"
            ? "Legal hold is on: nothing in this workspace will be deleted."
            : effective === "delete"
              ? `Finished envelopes older than ${periodLabel(form.retentionMonths)} will be deleted within the next hour, and from then on as they age.`
              : "Envelopes are kept until someone deletes them."}
        </p>
        {canEdit ? (
          <Button disabled={!dirty || save.isPending} onClick={() => save.mutate({ ...(settings.data ?? {}), ...form }, { onSuccess: () => setEdits(null) })}>
            {save.isPending ? <Loader2 className="animate-spin" /> : save.isSuccess && !dirty ? <Check /> : null}
            {save.isSuccess && !dirty ? "Saved" : "Save"}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">Only owners and admins can change this.</p>
        )}
      </div>
      {save.error ? <p className="text-sm text-destructive">{save.error.message}</p> : null}
    </div>
  );
}
