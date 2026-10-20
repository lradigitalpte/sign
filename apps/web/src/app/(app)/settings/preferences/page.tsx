"use client";

import { useState } from "react";

import { DATE_FORMAT_OPTIONS, LANGUAGE_OPTIONS, TIMEZONE_OPTIONS } from "@/components/envelopes/document-settings-dialog";
import { SaveBar, SettingRow, Toggle } from "@/components/settings/settings-controls";
import { SettingsScopeBar, useScopedSettings, type ScopedSettings } from "@/components/settings/settings-scope";
import { PageHeader } from "@/components/shared/page-header";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { WorkspaceSettings } from "@/lib/platform-api";

// Defaults for new envelopes, for the whole organization or for one team. The API copies the team's
// effective values onto each envelope when it's created (internal/envelope/defaults.go); senders can
// still change any of them per envelope.

type Form = { language: string; timezone: string; dateFormat: string; automaticReminders: boolean; firstReminderDays: number; repeatReminderDays: number };

const DEFAULTS: Form = { language: "en", timezone: "Etc/UTC", dateFormat: "YYYY-MM-DD", automaticReminders: true, firstReminderDays: 3, repeatReminderDays: 2 };

const validDays = (value: unknown, fallback: number) => {
  const days = Number(value);
  return Number.isInteger(days) && days >= 1 && days <= 90 ? days : fallback;
};

/** Saved settings as a complete form. Older versions saved free text; anything not in the lists shows the default. */
function formFrom(data: WorkspaceSettings): Form {
  return {
    language: LANGUAGE_OPTIONS.some((option) => option.value === data.language) ? String(data.language) : DEFAULTS.language,
    timezone: TIMEZONE_OPTIONS.some((option) => option.value === data.timezone) ? String(data.timezone) : DEFAULTS.timezone,
    dateFormat: DATE_FORMAT_OPTIONS.includes(String(data.dateFormat)) ? String(data.dateFormat) : DEFAULTS.dateFormat,
    automaticReminders: typeof data.automaticReminders === "boolean" ? data.automaticReminders : DEFAULTS.automaticReminders,
    firstReminderDays: validDays(data.firstReminderDays, DEFAULTS.firstReminderDays),
    repeatReminderDays: validDays(data.repeatReminderDays, DEFAULTS.repeatReminderDays),
  };
}

function PreferencesForm({ scoped }: { scoped: ScopedSettings }) {
  const [edits, setEdits] = useState<Partial<Form> | null>(null);
  const data = scoped.data ?? {};
  const form: Form = { ...formFrom(data), ...edits };
  const canEdit = scoped.canEdit;
  const daysValid = validDays(form.firstReminderDays, 0) > 0 && validDays(form.repeatReminderDays, 0) > 0;

  const change = (patch: Partial<Form>) => setEdits((current) => ({ ...current, ...patch }));

  const select = (id: string, value: string, options: { value: string; label: string }[], onChange: (value: string) => void) => (
    <Select value={value} onValueChange={onChange} disabled={!canEdit}>
      <SelectTrigger id={id} className="h-10 w-full sm:w-64">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <>
      <SettingsScopeBar scoped={scoped} label="preferences" customizeWith={form} />

      <section className="overflow-hidden rounded-3xl border bg-card shadow-sm">
        <div className="divide-y">
          <SettingRow title="Language" description="Used in emails and signing pages for recipients.">
            {select("pref-language", form.language, LANGUAGE_OPTIONS, (language) => change({ language }))}
          </SettingRow>
          <SettingRow title="Timezone" description="Used for dates and times on documents, emails and audit trails.">
            {select("pref-timezone", form.timezone, TIMEZONE_OPTIONS, (timezone) => change({ timezone }))}
          </SettingRow>
          <SettingRow title="Date format" description="How date fields are filled in when recipients sign.">
            {select("pref-date-format", form.dateFormat, DATE_FORMAT_OPTIONS.map((format) => ({ value: format, label: format })), (dateFormat) => change({ dateFormat }))}
          </SettingRow>
          <SettingRow title="Automatic reminders" description="Email recipients who haven't acted yet, on the schedule below.">
            <Toggle checked={form.automaticReminders} onChange={(automaticReminders) => change({ automaticReminders })} disabled={!canEdit} label="Automatic reminders" />
          </SettingRow>
          <SettingRow title="Reminder schedule" description="Days before the first reminder, then days between reminders (1–90).">
            <div className={`flex items-center gap-2 text-sm ${form.automaticReminders ? "" : "opacity-50"}`}>
              <Input aria-label="Days before the first reminder" type="number" min={1} max={90} value={form.firstReminderDays} disabled={!canEdit || !form.automaticReminders} onChange={(event) => change({ firstReminderDays: Number(event.target.value) })} className="w-20" />
              <span className="text-muted-foreground">then every</span>
              <Input aria-label="Days between reminders" type="number" min={1} max={90} value={form.repeatReminderDays} disabled={!canEdit || !form.automaticReminders} onChange={(event) => change({ repeatReminderDays: Number(event.target.value) })} className="w-20" />
              <span className="text-muted-foreground">days</span>
            </div>
          </SettingRow>
        </div>
      </section>

      <SaveBar
        canEdit={canEdit}
        dirty={edits !== null}
        saving={scoped.saving}
        saved={scoped.saved}
        error={scoped.error}
        note={
          !daysValid
            ? "Reminder days must be whole numbers from 1 to 90."
            : scoped.scope === "team"
              ? `Applies to ${scoped.team?.name}'s envelopes created from now on.`
              : "Applies to envelopes created from now on, in every team that uses the organisation's preferences."
        }
        onSave={() => {
          if (!daysValid) return;
          // The organization keeps any other keys it has; a team saves just these values as its own.
          const values = scoped.scope === "organization" ? { ...data, ...form } : form;
          void scoped.save(values).then(() => setEdits(null));
        }}
      />
    </>
  );
}

export default function PreferencesPage() {
  const scoped = useScopedSettings("preferences");
  return (
    <div className="space-y-6 pb-10">
      <PageHeader eyebrow="Team settings" title="Preferences" description="Defaults for every new envelope. Senders can change them for any single envelope." />
      {/* A fresh form per scope, so unsaved edits never carry over from the organization to a team. */}
      <PreferencesForm key={`${scoped.scope}-${scoped.customized}`} scoped={scoped} />
    </div>
  );
}
