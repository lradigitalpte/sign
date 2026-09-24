"use client";

import { Check, ImageUp, Loader2, Save, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUpdateWorkspaceSettings, useWorkspaceSettings } from "@/hooks/use-envelope-api";

const MAX_LOGO_WIDTH = 320;
const MAX_LOGO_HEIGHT = 96;

function resizeImageToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => {
      const scale = Math.min(1, MAX_LOGO_WIDTH / image.naturalWidth, MAX_LOGO_HEIGHT / image.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Canvas unavailable"));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/png"));
      URL.revokeObjectURL(image.src);
    };
    image.onerror = reject;
    image.src = URL.createObjectURL(file);
  });
}

export default function BrandingSettingsPage() {
  const query = useWorkspaceSettings("branding");
  const mutation = useUpdateWorkspaceSettings("branding");
  const uploadRef = useRef<HTMLInputElement>(null);

  const [logoDataUrl, setLogoDataUrl] = useState("");
  const [brandName, setBrandName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#2563eb");
  const [hidePlatformBranding, setHidePlatformBranding] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (query.data) {
      setLogoDataUrl(typeof query.data.logoDataUrl === "string" ? query.data.logoDataUrl : "");
      setBrandName(typeof query.data.brandName === "string" ? query.data.brandName : "");
      setPrimaryColor(typeof query.data.primaryColor === "string" && query.data.primaryColor ? query.data.primaryColor : "#2563eb");
      setHidePlatformBranding(Boolean(query.data.hidePlatformBranding));
      setDirty(false);
    }
  }, [query.data]);

  const handleUpload = async (file: File) => {
    setUploadError(null);
    if (!/image\/(png|jpeg|svg\+xml)/.test(file.type)) {
      setUploadError("Upload a PNG, JPG, or SVG image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setUploadError("Logo must be smaller than 2 MB.");
      return;
    }
    try {
      const dataUrl = file.type === "image/svg+xml" ? await file.text().then((svg) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`) : await resizeImageToDataURL(file);
      if (dataUrl.length > 700_000) {
        setUploadError("That image is too complex to embed — try a simpler PNG/JPG or a smaller SVG.");
        return;
      }
      setLogoDataUrl(dataUrl);
      setDirty(true);
    } catch {
      setUploadError("Unable to process that image.");
    }
  };

  const save = async () => {
    await mutation.mutateAsync({ logoDataUrl, brandName, primaryColor, hidePlatformBranding });
    setDirty(false);
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-3 py-8 sm:px-0 lg:py-10">
      <header className="flex flex-col justify-between gap-5 border-b pb-7 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-blue-600">Workspace settings</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-.04em] sm:text-4xl">Branding</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Recipients see this logo and name on the pages and emails you send them — instead of a generic sender.
          </p>
        </div>
        <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
          <ShieldCheck className="size-6" />
        </div>
      </header>

      {query.isLoading ? (
        <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" /> Loading settings…
        </div>
      ) : (
        <section className="mt-7 overflow-hidden rounded-3xl border bg-card shadow-sm">
          <div className="divide-y">
            <div className="grid gap-4 p-5 sm:grid-cols-[1fr_minmax(220px,320px)] sm:items-center sm:p-6">
              <div>
                <h2 className="text-sm font-semibold">Logo</h2>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">Shown on signing pages and in invitation emails. PNG, JPG, or SVG, up to 2 MB.</p>
                {uploadError ? <p className="mt-2 text-xs text-destructive">{uploadError}</p> : null}
              </div>
              <div className="ml-auto flex items-center gap-3">
                <input
                  ref={uploadRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void handleUpload(file);
                  }}
                />
                {logoDataUrl ? (
                  <div className="flex items-center gap-2">
                    <div className={"flex h-14 w-28 items-center justify-center rounded-xl border bg-[repeating-conic-gradient(#f3f4f6_0_25%,white_0_50%)] bg-[length:12px_12px] p-2"}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={logoDataUrl} alt="Logo preview" className="max-h-full max-w-full object-contain" />
                    </div>
                    <Button type="button" size="icon" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => { setLogoDataUrl(""); setDirty(true); }}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ) : null}
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => uploadRef.current?.click()}>
                  <ImageUp className="size-4" />
                  {logoDataUrl ? "Replace" : "Upload logo"}
                </Button>
              </div>
            </div>

            <div className="grid gap-4 p-5 sm:grid-cols-[1fr_minmax(220px,320px)] sm:items-center sm:p-6">
              <div>
                <h2 className="text-sm font-semibold">Brand name</h2>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">Used as a text fallback wherever there&apos;s no room for the logo.</p>
              </div>
              <Input value={brandName} placeholder="Your company" onChange={(event) => { setBrandName(event.target.value); setDirty(true); }} className="ml-auto" />
            </div>

            <div className="grid gap-4 p-5 sm:grid-cols-[1fr_minmax(220px,320px)] sm:items-center sm:p-6">
              <div>
                <h2 className="text-sm font-semibold">Primary color</h2>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">Used for the call-to-action button in emails.</p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <input
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(primaryColor) ? primaryColor : "#2563eb"}
                  onChange={(event) => { setPrimaryColor(event.target.value); setDirty(true); }}
                  className="size-9 cursor-pointer rounded-lg border bg-transparent p-1"
                />
                <Input value={primaryColor} onChange={(event) => { setPrimaryColor(event.target.value); setDirty(true); }} className="w-28" />
              </div>
            </div>

            <div className="grid gap-4 p-5 sm:grid-cols-[1fr_minmax(220px,320px)] sm:items-center sm:p-6">
              <div>
                <h2 className="text-sm font-semibold">Hide platform branding</h2>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">Remove the &ldquo;Powered by Secure Sign&rdquo; credit from recipient-facing pages and emails.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={hidePlatformBranding}
                onClick={() => { setHidePlatformBranding((current) => !current); setDirty(true); }}
                className={`relative ml-auto h-7 w-12 rounded-full transition ${hidePlatformBranding ? "bg-blue-600" : "bg-muted"}`}
              >
                <span className={`absolute top-1 size-5 rounded-full bg-white shadow-sm transition ${hidePlatformBranding ? "left-6" : "left-1"}`} />
              </button>
            </div>
          </div>

          <footer className="flex flex-col gap-3 border-t bg-surface-subtle/60 p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className={`text-sm ${mutation.isError ? "text-destructive" : "text-emerald-600"}`}>
              {mutation.isError
                ? mutation.error instanceof Error
                  ? mutation.error.message
                  : "Unable to save settings."
                : mutation.isSuccess && !dirty
                  ? (
                    <span className="flex items-center gap-1.5">
                      <Check className="size-4" /> Settings saved
                    </span>
                  )
                  : dirty
                    ? "You have unsaved changes."
                    : "All changes are saved."}
            </p>
            <Button disabled={!dirty || mutation.isPending} onClick={() => void save()}>
              <Save /> {mutation.isPending ? "Saving…" : "Save changes"}
            </Button>
          </footer>
        </section>
      )}
    </main>
  );
}
