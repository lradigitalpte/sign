"use client";

import { Check, HardDrive, Loader2, PlugZap, Save, Unplug } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useDisconnectWorkspaceStorage,
  useTestWorkspaceStorage,
  useUpdateWorkspaceStorage,
  useWorkspaceStorage,
} from "@/hooks/use-envelope-api";
import type { WorkspaceStorageConfig, WorkspaceStorageInput } from "@/lib/platform-api";

type FormState = {
  provider: WorkspaceStorageConfig["provider"];
  endpoint: string;
  bucket: string;
  region: string;
  useSsl: boolean;
  accessKeyId: string;
  secretAccessKey: string;
  enabled: boolean;
};

const emptyForm: FormState = {
  provider: "platform",
  endpoint: "",
  bucket: "",
  region: "",
  useSsl: true,
  accessKeyId: "",
  secretAccessKey: "",
  enabled: false,
};

function toForm(config?: WorkspaceStorageConfig | null): FormState {
  if (!config || config.usingPlatform) {
    return { ...emptyForm };
  }
  return {
    provider: config.provider,
    endpoint: config.endpoint ?? "",
    bucket: config.bucket ?? "",
    region: config.region ?? "",
    useSsl: config.useSsl ?? true,
    accessKeyId: config.accessKeyId ?? "",
    secretAccessKey: "",
    enabled: config.enabled,
  };
}

export default function StorageSettingsPage() {
  const query = useWorkspaceStorage();
  const save = useUpdateWorkspaceStorage();
  const test = useTestWorkspaceStorage();
  const disconnect = useDisconnectWorkspaceStorage();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (query.data) {
      setForm(toForm(query.data));
      setDirty(false);
    }
  }, [query.data]);

  const byos = form.provider !== "platform";
  const canSubmit = useMemo(() => {
    if (!byos) return dirty;
    return dirty && Boolean(form.bucket && form.accessKeyId && (form.secretAccessKey || query.data?.secretAccessKeySet) && (form.endpoint || form.provider === "s3"));
  }, [byos, dirty, form, query.data?.secretAccessKeySet]);

  function change<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
    save.reset();
    test.reset();
  }

  function payload(): WorkspaceStorageInput {
    return {
      provider: form.provider,
      endpoint: form.endpoint.trim(),
      bucket: form.bucket.trim(),
      region: form.region.trim(),
      useSsl: form.useSsl,
      accessKeyId: form.accessKeyId.trim(),
      secretAccessKey: form.secretAccessKey,
      enabled: form.enabled && form.provider !== "platform",
    };
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-3 py-8 sm:px-0 lg:py-10">
      <PageHeader
        title="Document storage"
        description="Keep uploaded and signed PDFs in your own Amazon S3 or Cloudflare R2 bucket for stronger security and trust controls."
      />

      {query.isLoading ? (
        <div className="mt-10 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading storage settings…
        </div>
      ) : (
        <section className="mt-8 overflow-hidden rounded-3xl border bg-card shadow-sm">
          <div className="flex items-start gap-4 border-b bg-surface-subtle/50 p-6">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
              <HardDrive className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold">Bring your own storage</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                When connected, new uploads, attachments, and completed signed PDFs for this organization are written to your bucket.
                Envelope metadata and the audit trail stay on the platform.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {query.data?.usingPlatform
                  ? "Currently using platform-managed storage."
                  : `Active customer storage · ${query.data?.provider?.toUpperCase()} · ${query.data?.bucket}`}
              </p>
            </div>
          </div>

          <div className="divide-y">
            <div className="grid gap-4 p-5 sm:grid-cols-[1fr_minmax(220px,320px)] sm:items-center sm:p-6">
              <div>
                <h3 className="text-sm font-semibold">Storage provider</h3>
                <p className="mt-1 text-sm text-muted-foreground">Use platform storage or connect an S3-compatible bucket.</p>
              </div>
              <select
                className="h-10 rounded-xl border bg-background px-3 text-sm"
                value={form.provider}
                onChange={(event) => {
                  const provider = event.target.value as FormState["provider"];
                  change("provider", provider);
                  change("enabled", provider !== "platform");
                  if (provider === "r2") change("useSsl", true);
                }}
              >
                <option value="platform">Platform managed</option>
                <option value="s3">Amazon S3</option>
                <option value="r2">Cloudflare R2</option>
                <option value="s3_compatible">Custom S3-compatible</option>
              </select>
            </div>

            {byos && (
              <>
                <div className="grid gap-4 p-5 sm:grid-cols-[1fr_minmax(220px,320px)] sm:items-center sm:p-6">
                  <div>
                    <h3 className="text-sm font-semibold">Endpoint</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {form.provider === "s3"
                        ? "Optional. Leave blank to use the default AWS S3 endpoint for the region."
                        : form.provider === "r2"
                          ? "Required. Example: <accountid>.r2.cloudflarestorage.com"
                          : "Required custom S3 API endpoint host (no https://)."}
                    </p>
                  </div>
                  <Input
                    value={form.endpoint}
                    placeholder={form.provider === "r2" ? "xxxx.r2.cloudflarestorage.com" : "s3.amazonaws.com"}
                    onChange={(event) => change("endpoint", event.target.value)}
                  />
                </div>
                <div className="grid gap-4 p-5 sm:grid-cols-[1fr_minmax(220px,320px)] sm:items-center sm:p-6">
                  <div>
                    <h3 className="text-sm font-semibold">Bucket</h3>
                    <p className="mt-1 text-sm text-muted-foreground">The existing bucket where organization documents will be stored.</p>
                  </div>
                  <Input value={form.bucket} placeholder="company-signing-docs" onChange={(event) => change("bucket", event.target.value)} />
                </div>
                <div className="grid gap-4 p-5 sm:grid-cols-[1fr_minmax(220px,320px)] sm:items-center sm:p-6">
                  <div>
                    <h3 className="text-sm font-semibold">Region</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Used for Amazon S3 defaults. Optional for R2 and custom endpoints.</p>
                  </div>
                  <Input value={form.region} placeholder="us-east-1" onChange={(event) => change("region", event.target.value)} />
                </div>
                <div className="grid gap-4 p-5 sm:grid-cols-[1fr_minmax(220px,320px)] sm:items-center sm:p-6">
                  <div>
                    <h3 className="text-sm font-semibold">Access key ID</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Least-privilege credentials limited to this bucket.</p>
                  </div>
                  <Input value={form.accessKeyId} autoComplete="off" onChange={(event) => change("accessKeyId", event.target.value)} />
                </div>
                <div className="grid gap-4 p-5 sm:grid-cols-[1fr_minmax(220px,320px)] sm:items-center sm:p-6">
                  <div>
                    <h3 className="text-sm font-semibold">Secret access key</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {query.data?.secretAccessKeySet
                        ? "A secret is already saved. Enter a new value only to rotate it."
                        : "Stored encrypted at rest. Never shown again after save."}
                    </p>
                  </div>
                  <Input
                    type="password"
                    value={form.secretAccessKey}
                    placeholder={query.data?.secretAccessKeySet ? "••••••••••••" : ""}
                    autoComplete="new-password"
                    onChange={(event) => change("secretAccessKey", event.target.value)}
                  />
                </div>
                <div className="grid gap-4 p-5 sm:grid-cols-[1fr_minmax(220px,320px)] sm:items-center sm:p-6">
                  <div>
                    <h3 className="text-sm font-semibold">Use SSL / HTTPS</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Required for AWS S3 and Cloudflare R2.</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.useSsl}
                    onClick={() => change("useSsl", !form.useSsl)}
                    className={`relative ml-auto h-7 w-12 rounded-full transition ${form.useSsl ? "bg-blue-600" : "bg-muted"}`}
                  >
                    <span className={`absolute top-1 size-5 rounded-full bg-white shadow-sm transition ${form.useSsl ? "left-6" : "left-1"}`} />
                  </button>
                </div>
                <div className="grid gap-4 p-5 sm:grid-cols-[1fr_minmax(220px,320px)] sm:items-center sm:p-6">
                  <div>
                    <h3 className="text-sm font-semibold">Enable for this organization</h3>
                    <p className="mt-1 text-sm text-muted-foreground">When enabled, new document bytes go to the connected bucket.</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.enabled}
                    onClick={() => change("enabled", !form.enabled)}
                    className={`relative ml-auto h-7 w-12 rounded-full transition ${form.enabled ? "bg-blue-600" : "bg-muted"}`}
                  >
                    <span className={`absolute top-1 size-5 rounded-full bg-white shadow-sm transition ${form.enabled ? "left-6" : "left-1"}`} />
                  </button>
                </div>
              </>
            )}
          </div>

          <footer className="flex flex-col gap-3 border-t bg-surface-subtle/60 p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className={`text-sm ${save.isError || test.isError || disconnect.isError ? "text-destructive" : "text-emerald-600"}`}>
              {save.isError || test.isError || disconnect.isError
                ? (save.error ?? test.error ?? disconnect.error) instanceof Error
                  ? ((save.error ?? test.error ?? disconnect.error) as Error).message
                  : "Unable to update storage settings."
                : save.isSuccess || disconnect.isSuccess
                  ? (
                      <span className="flex items-center gap-1.5">
                        <Check className="size-4" /> Settings saved
                      </span>
                    )
                  : test.isSuccess
                    ? (
                        <span className="flex items-center gap-1.5">
                          <Check className="size-4" /> Connection successful
                        </span>
                      )
                    : query.data?.lastError
                      ? `Last test error: ${query.data.lastError}`
                      : dirty
                        ? "You have unsaved changes."
                        : "All changes are saved."}
            </p>
            <div className="flex flex-wrap gap-2">
              {!query.data?.usingPlatform && (
                <Button
                  variant="outline"
                  disabled={disconnect.isPending}
                  onClick={async () => {
                    await disconnect.mutateAsync();
                    setDirty(false);
                  }}
                >
                  <Unplug /> Disconnect
                </Button>
              )}
              {byos && (
                <Button
                  variant="outline"
                  disabled={test.isPending}
                  onClick={async () => {
                    await test.mutateAsync(payload());
                  }}
                >
                  <PlugZap /> {test.isPending ? "Testing…" : "Test connection"}
                </Button>
              )}
              <Button
                disabled={!canSubmit || save.isPending}
                onClick={async () => {
                  await save.mutateAsync(payload());
                  setForm((current) => ({ ...current, secretAccessKey: "" }));
                  setDirty(false);
                }}
              >
                <Save /> {save.isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </footer>
        </section>
      )}
    </main>
  );
}
