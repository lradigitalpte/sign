"use client";

import { useState } from "react";

import { SaveBar, SettingRow, Toggle } from "@/components/settings/settings-controls";
import { SettingsScopeBar, useScopedSettings, type ScopedSettings } from "@/components/settings/settings-scope";
import { PageHeader } from "@/components/shared/page-header";

// Defaults for the sender alerts on new envelopes (notify_on_view / notify_on_sign), for the whole
// organization or one team, copied onto each envelope when it's created. Senders can turn them on or off
// for a single envelope in its settings.

type Form = { recipientViewed: boolean; recipientSigned: boolean };

function NotificationsForm({ scoped }: { scoped: ScopedSettings }) {
  const [edits, setEdits] = useState<Partial<Form> | null>(null);
  const data = scoped.data ?? {};
  const saved: Form = {
    recipientViewed: typeof data.recipientViewed === "boolean" ? data.recipientViewed : true,
    recipientSigned: typeof data.recipientSigned === "boolean" ? data.recipientSigned : true,
  };
  const form: Form = { ...saved, ...edits };
  const change = (patch: Partial<Form>) => setEdits((current) => ({ ...current, ...patch }));

  return (
    <>
      <SettingsScopeBar scoped={scoped} label="notifications" customizeWith={form} />

      <section className="overflow-hidden rounded-3xl border bg-card shadow-sm">
        <div className="divide-y">
          <SettingRow title="A recipient opens the envelope" description="Email the sender the first time each recipient opens it.">
            <Toggle checked={form.recipientViewed} onChange={(recipientViewed) => change({ recipientViewed })} disabled={!scoped.canEdit} label="Email when a recipient opens the envelope" />
          </SettingRow>
          <SettingRow title="A recipient signs or approves" description="Email the sender each time a signer signs or an approver approves.">
            <Toggle checked={form.recipientSigned} onChange={(recipientSigned) => change({ recipientSigned })} disabled={!scoped.canEdit} label="Email when a recipient signs or approves" />
          </SettingRow>
        </div>
      </section>

      <SaveBar
        canEdit={scoped.canEdit}
        dirty={edits !== null}
        saving={scoped.saving}
        saved={scoped.saved}
        error={scoped.error}
        note={scoped.scope === "team" ? `Applies to ${scoped.team?.name}'s envelopes created from now on.` : "Applies to envelopes created from now on, in every team that uses the organisation's notifications."}
        onSave={() => {
          const values = scoped.scope === "organization" ? { ...data, ...form } : form;
          void scoped.save(values).then(() => setEdits(null));
        }}
      />
    </>
  );
}

export default function NotificationsPage() {
  const scoped = useScopedSettings("notifications");
  return (
    <div className="space-y-6 pb-10">
      <PageHeader eyebrow="Team settings" title="Notifications" description="Which emails senders get about their envelopes. These are defaults for new envelopes; each sender can change them per envelope." />
      <NotificationsForm key={`${scoped.scope}-${scoped.customized}`} scoped={scoped} />
    </div>
  );
}
