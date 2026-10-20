"use client";

import { Check, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (value: boolean) => void; disabled?: boolean; label: string }) {
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

/** One setting: label and explanation on the left, its control on the right. */
export function SettingRow({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="grid gap-3 p-5 sm:grid-cols-[1fr_minmax(200px,280px)] sm:items-center sm:p-6">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
      </div>
      <div className="sm:justify-self-end">{children}</div>
    </div>
  );
}

/** Save button and status under a settings form; read-only members see who can change it. */
export function SaveBar({ canEdit, dirty, saving, saved, error, onSave, note }: { canEdit: boolean; dirty: boolean; saving: boolean; saved: boolean; error: Error | null; onSave: () => void; note: ReactNode }) {
  return (
    <>
      <div className="flex flex-col gap-3 rounded-3xl border bg-surface-subtle/60 p-5 sm:flex-row sm:items-center">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">{note}</p>
        {canEdit ? (
          <Button disabled={!dirty || saving} onClick={onSave}>
            {saving ? <Loader2 className="animate-spin" /> : saved && !dirty ? <Check /> : null}
            {saved && !dirty ? "Saved" : "Save"}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">Only owners and admins can change this.</p>
        )}
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error.message}</p> : null}
    </>
  );
}
