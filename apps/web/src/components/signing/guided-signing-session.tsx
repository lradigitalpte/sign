"use client";

import { ArrowLeft, Check, ImageUp, Loader2, PenLine, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { SignatureFontPicker } from "@/components/signing/signature-font-picker";
import { SigningFieldPalette } from "@/components/signing/signing-field-palette";
import { SigningFieldOverlay, SigningOverlaySurface } from "@/components/signing/signing-field-overlay";
import { PdfPage, PdfPager } from "@/components/shared/pdf-page";
import { SignaturePad, type SignaturePadHandle } from "@/components/shared/signature-pad";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSignaturePreferences } from "@/hooks/use-envelope-api";
import { signatureFontById } from "@/lib/signature-fonts";
import { CHECKERBOARD_CLASS, renderTypedSignaturePng, SIGNATURE_INK_COLORS, signatureInkById, trimTransparentCanvas } from "@/lib/signature-maker";
import { clampPlacement, SIGNING_FIELD_LABELS, type FieldPlacement } from "@/lib/field-placement";
import { ApiError, completeSigning, createSigningField, deleteSigningField, getSigningSession, saveSigningField, signingDocumentPath, updateSigningFieldPlacement, uploadSigningFieldFile, viewSigningSession, type SigningField, type SigningSession } from "@/lib/platform-api";
import { cn } from "@/lib/utils";

type Appearance = { id?: string; name?: string; text: string; image?: string; source?: string; font?: string; color?: string; items?: Appearance[] };

function mergeField(field: SigningField, override?: Partial<SigningField>) {
  return override ? { ...field, ...override } : field;
}

function fieldValue(field: SigningField, name: string): unknown {
  if (field.type === "date") {
    return { iso: new Date().toISOString().slice(0, 10), text: new Date().toLocaleDateString() };
  }
  if (field.type === "checkbox") {
    return { checked: true };
  }
  if (field.type === "name") {
    return { text: name };
  }
  return { text: name || field.label || field.type };
}

function completedPath(variant: "public" | "workspace", token: string, envelopeId?: string) {
  if (variant === "workspace" && envelopeId) {
    return `/envelopes/${envelopeId}`;
  }
  return `/sign/${token}/completed`;
}

function initialsFromName(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function parseAppearance(value: unknown): Appearance | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.checked === true) {
    return { text: "✓" };
  }
  const text =
    typeof record.text === "string"
      ? record.text
      : typeof record.iso === "string"
        ? record.iso
        : "";
  const image = typeof record.image === "string" ? record.image : undefined;
  if (!text && !image) {
    return null;
  }
  return { text, image };
}

function readSaved(kind: "signature" | "initials"): Appearance | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(kind === "initials" ? "yoursign.saved-initials" : "yoursign.saved-signature");
    return raw ? (JSON.parse(raw) as Appearance) : null;
  } catch {
    return null;
  }
}

function writeSaved(kind: "signature" | "initials", value: Appearance) {
  try {
    window.localStorage.setItem(kind === "initials" ? "yoursign.saved-initials" : "yoursign.saved-signature", JSON.stringify(value));
  } catch {
    // Signing still works when browser storage is unavailable.
  }
}

function displayField(field: SigningField, override?: Partial<SigningField>) {
  return mergeField(field, override);
}

export function GuidedSigningSession({ token, variant, layoutMode = false }: { token: string; variant: "public" | "workspace"; layoutMode?: boolean }) {
  const t = useTranslations("RecipientSigning");
  const router = useRouter();
  const preferences = useSignaturePreferences();
  const [session, setSession] = useState<SigningSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [adopted, setAdopted] = useState<Appearance | null>(() => readSaved("signature"));
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [renderedPages, setRenderedPages] = useState(1);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<SigningField | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [fieldOverrides, setFieldOverrides] = useState<Record<string, Partial<SigningField>>>({});
  const placementTimers = useRef(new Map<string, number>());
  const [textTarget, setTextTarget] = useState<SigningField | null>(null);
  const [choiceTarget, setChoiceTarget] = useState<SigningField | null>(null);
  const [draft, setDraft] = useState("");
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<SigningField | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load =
      variant === "workspace"
        ? viewSigningSession(token).catch(async (caught) => {
            if (caught instanceof ApiError && caught.status === 409) {
              return getSigningSession(token);
            }
            throw caught;
          })
        : getSigningSession(token);

    load
      .then((value) => {
        if (cancelled) return;
        setSession(value);
        setFullName((current) => current || value.recipient.name);
        const nextField = value.fields.find((field) => field.recipientId === value.recipient.id && !field.completed);
        if (nextField) {
          setPage(nextField.page);
        }
        if (value.recipient.status === "completed") {
          router.replace(completedPath(variant, token, value.envelope.id));
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Unable to load signing session");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [router, token, variant]);

  useEffect(() => {
    const signature = preferences.data?.signature;
    if (!signature) {
      return;
    }
    const items = signature.items?.length ? signature.items : [signature];
    const selected = items.find((item) => item.id === signature.id) ?? items[0];
    if (!selected) {
      return;
    }
    const next = { ...selected, items };
    setAdopted(next);
    writeSaved("signature", next);
    if (preferences.data?.initials) {
      writeSaved("initials", preferences.data.initials);
    }
  }, [preferences.data]);

  const document = session?.documents[0];
  const remaining = session?.remainingRequired ?? 0;
  const ownFields = useMemo(() => session?.fields.filter((field) => field.recipientId === session.recipient.id) ?? [], [session]);
  const incomplete = useMemo(() => ownFields.filter((field) => !field.completed), [ownFields]);

  const selectedField = session?.fields.find((field) => field.id === selectedFieldId) ?? null;

  const flushPlacement = async (fieldId: string) => {
    const timer = placementTimers.current.get(fieldId);
    if (timer) {
      window.clearTimeout(timer);
      placementTimers.current.delete(fieldId);
    }
    const override = fieldOverrides[fieldId];
    if (!override?.page || override.x === undefined || override.y === undefined || override.width === undefined || override.height === undefined) {
      return;
    }
    try {
      const result = await updateSigningFieldPlacement(token, fieldId, {
        page: override.page,
        x: override.x,
        y: override.y,
        width: override.width,
        height: override.height,
      });
      setSession(result.session);
      setFieldOverrides((current) => {
        const next = { ...current };
        delete next[fieldId];
        return next;
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("loadError"));
    }
  };

  const flushAllPlacements = async () => {
    const pending = Object.keys(fieldOverrides);
    for (const fieldId of pending) {
      await flushPlacement(fieldId);
    }
  };

  const schedulePlacement = (fieldId: string, placement: FieldPlacement) => {
    setFieldOverrides((current) => ({
      ...current,
      [fieldId]: { ...current[fieldId], ...placement },
    }));
    const existing = placementTimers.current.get(fieldId);
    if (existing) {
      window.clearTimeout(existing);
    }
    const timer = window.setTimeout(() => {
      void flushPlacement(fieldId);
    }, 350);
    placementTimers.current.set(fieldId, timer);
  };

  const fill = async (field: SigningField, value: unknown) => {
    setBusy(true);
    setError(null);
    try {
      const override = fieldOverrides[field.id];
      const placement =
        override?.page && override.x !== undefined && override.y !== undefined && override.width !== undefined && override.height !== undefined
          ? { page: override.page, x: override.x, y: override.y, width: override.width, height: override.height }
          : undefined;
      if (placement) {
        await flushPlacement(field.id);
      }
      const result = await saveSigningField(token, field.id, value, placement);
      setSession(result.session);
      setFieldOverrides((current) => {
        const next = { ...current };
        delete next[field.id];
        return next;
      });
      setSelectedFieldId(field.id);
      const next = result.session.fields.find((item) => item.recipientId === result.session.recipient.id && !item.completed);
      if (next && next.id !== field.id) {
        setPage(next.page);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("loadError"));
    } finally {
      setBusy(false);
    }
  };

  const applySignature = async (value: Appearance, field: SigningField) => {
    const kind = field.type === "initials" ? "initials" : "signature";
    const saved = readSaved(kind);
    const next = saved?.items ? { ...value, items: saved.items } : value;
    if (kind === "signature") {
      setAdopted(next);
    }
    writeSaved(kind, next);
    setPickerOpen(false);
    setPickerTarget(null);
    setPage(field.page);
    setSelectedFieldId(field.id);
    await fill(field, { text: next.text, image: next.image });
  };

  const addField = async (type: SigningField["type"], placement: FieldPlacement) => {
    if (!document || !session) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await createSigningField(token, {
        documentId: document.id,
        type,
        page: placement.page,
        x: placement.x,
        y: placement.y,
        width: placement.width,
        height: placement.height,
        label: SIGNING_FIELD_LABELS[type],
      });
      setSession(result.session);
      setSelectedFieldId(result.field.id);
      setPage(result.field.page);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("loadError"));
    } finally {
      setBusy(false);
    }
  };

  const removeField = async (fieldId: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await deleteSigningField(token, fieldId);
      setSession(result.session);
      if (selectedFieldId === fieldId) {
        setSelectedFieldId(null);
      }
      setFieldOverrides((current) => {
        const next = { ...current };
        delete next[fieldId];
        return next;
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("loadError"));
    } finally {
      setBusy(false);
    }
  };

  const activate = (field: SigningField) => {
    if (busy || !session || field.recipientId !== session.recipient.id) {
      return;
    }
    setSelectedFieldId(field.id);
    setPage(field.page);
    if (!field.completed && (field.type === "date" || field.type === "name" || field.type === "checkbox")) {
      void fill(field, fieldValue(field, fullName || session.recipient.name));
      return;
    }
    if (!field.completed && (field.type === "signature" || field.type === "initials")) {
      setDraft(field.type === "initials" ? initialsFromName(fullName || session.recipient.name) : fullName || session.recipient.name);
      setPickerTarget(field);
      setPickerOpen(true);
      return;
    }
    if (!field.completed && field.type === "text") {
      setDraft(parseAppearance(field.value)?.text || fullName || session.recipient.name);
      setTextTarget(field);
      return;
    }
    if (!field.completed && (field.type === "dropdown" || field.type === "radio")) {
      setChoiceTarget(field);
      return;
    }
    if (!field.completed && field.type === "attachment") {
      setUploadTarget(field);
      uploadInputRef.current?.click();
    }
  };

  const handleAttachmentUpload = async (field: SigningField, file: File) => {
    setBusy(true);
    setError(null);
    try {
      const result = await uploadSigningFieldFile(token, field.id, file);
      setSession(result.session);
      setUploadTarget(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("loadError"));
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    if (!session) return;
    await flushAllPlacements();
    if (layoutMode && session.recipient.role === "signer" && !ownFields.some((field) => field.type === "signature" && field.completed)) {
      setError("Add and fill at least one signature field before finishing.");
      return;
    }
    setBusy(true);
    try {
      await completeSigning(token);
      router.push(completedPath(variant, token, session.envelope.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("loadError"));
      setBusy(false);
    }
  };

  if (error && !session) {
    return <main className="grid h-full flex-1 place-items-center px-6 text-center font-semibold">{error}</main>;
  }
  if (!session || !document) {
    return (
      <main className="grid h-full flex-1 place-items-center">
        <Loader2 className="size-5 animate-spin" />
      </main>
    );
  }

  const pageCount = Math.max(document.pageCount, renderedPages);
  const requiredTotal = ownFields.filter((field) => field.required).length;
  const requiredDone = requiredTotal - remaining;
  const isApprover = session.recipient.role === "approver";
  const finishLabel = isApprover ? t("finishApprove") : t("finishSubmit");
  const canFinish =
    (session.recipient.role !== "signer" || remaining === 0) &&
    (!layoutMode || session.recipient.role !== "signer" || ownFields.some((field) => field.type === "signature" && field.completed));

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-zinc-100 dark:bg-background">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-3 sm:px-5">
        {variant === "workspace" ? (
          <Button asChild size="sm" variant="ghost" className="shrink-0">
            <Link href="/inbox">
              <ArrowLeft className="size-4" />
              Inbox
            </Link>
          </Button>
        ) : null}
        {session.organizationBrand.logoDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={session.organizationBrand.logoDataUrl} alt={session.organizationName} className="h-7 max-w-[120px] shrink-0 object-contain" />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{session.envelope.title}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {isApprover
              ? t("approvalProgress")
              : t("fieldProgress", { current: Math.min(requiredDone + (remaining > 0 ? 1 : 0), Math.max(requiredTotal, 1)), total: Math.max(requiredTotal, 1) })}
          </p>
        </div>
        <Button size="sm" className="hidden shrink-0 sm:inline-flex" onClick={() => void finish()} disabled={busy || !canFinish}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {finishLabel}
        </Button>
      </header>
      {error ? <p className="shrink-0 bg-destructive/5 px-4 py-2 text-xs text-destructive">{error}</p> : null}
      <input
        ref={uploadInputRef}
        type="file"
        className="hidden"
        accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.doc,.docx"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file && uploadTarget) {
            void handleAttachmentUpload(uploadTarget, file);
          }
        }}
      />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="relative min-h-0 flex-1 overflow-auto">
          <div className="sticky top-0 z-10 flex justify-center px-3 py-3">
            <PdfPager page={page} pageCount={pageCount} onChange={setPage} />
          </div>
          <div className="flex justify-center px-4 pb-10">
            <PdfPage
              src={signingDocumentPath(token, document.id)}
              page={page}
              width={820}
              onDocumentLoad={({ pageCount: count }) => setRenderedPages(count)}
            >
              <SigningOverlaySurface onBackgroundClick={() => setSelectedFieldId(null)}>
                {session.fields
                  .filter((field) => {
                    const shown = displayField(field, fieldOverrides[field.id]);
                    return shown.page === page;
                  })
                  .map((field) => {
                    const shown = displayField(field, fieldOverrides[field.id]);
                    const isSelected = selectedFieldId === field.id;
                    const isOwn = field.recipientId === session.recipient.id;
                    return (
                      <SigningFieldOverlay
                        key={field.id}
                        busy={busy}
                        movable={isSelected && isOwn}
                        readOnly={!isOwn}
                        field={shown}
                        selected={isSelected}
                        appearance={parseAppearance(field.value)}
                        onActivate={() => activate(field)}
                        onPlacementChange={(placement) => schedulePlacement(field.id, placement)}
                        onPlacementCommit={() => void flushPlacement(field.id)}
                      />
                    );
                  })}
              </SigningOverlaySurface>
            </PdfPage>
          </div>
        </section>

        <aside className="flex max-h-[46vh] shrink-0 flex-col border-t bg-background lg:max-h-none lg:w-[360px] lg:border-s lg:border-t-0">
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5">
            <div>
              <Label htmlFor="signing-full-name">{t("fullNameLabel")}</Label>
              <Input
                id="signing-full-name"
                className="mt-2"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
              />
            </div>

            {layoutMode ? (
              <SigningFieldPalette
                busy={busy}
                onAdd={(type, placement) => {
                  void addField(type, { ...placement, page });
                }}
              />
            ) : null}

            {selectedField ? (
              <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
                <p className="text-sm font-semibold">{selectedField.label ?? selectedField.type}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Drag to move on the page. Use the blue corner handle to resize.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(selectedField.type === "signature" || selectedField.type === "initials") && !selectedField.completed ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        setDraft(
                          selectedField.type === "initials"
                            ? initialsFromName(fullName || session.recipient.name)
                            : fullName || session.recipient.name,
                        );
                        setPickerTarget(selectedField);
                        setPickerOpen(true);
                      }}
                    >
                      Choose {selectedField.type === "initials" ? "initials" : "signature"}
                    </Button>
                  ) : null}
                  {layoutMode ? (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void removeField(selectedField.id)}>
                      <Trash2 className="size-4" />
                      Remove
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="rounded-xl border border-dashed px-3 py-2 text-xs text-muted-foreground">
                Click a field on the document to select it, then drag or resize.
              </p>
            )}

            {ownFields.some((field) => field.type === "signature" || field.type === "initials") ? (
              <div>
                <Label>Signature library</Label>
                <button
                  type="button"
                  className={cn("mt-2 flex aspect-[3/1] w-full items-center justify-center overflow-hidden rounded-lg border text-zinc-800", CHECKERBOARD_CLASS)}
                  onClick={() => {
                    setPickerTarget(null);
                    setDraft(fullName || session.recipient.name);
                    setPickerOpen(true);
                  }}
                >
                  {adopted?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt="" src={adopted.image} className="h-full w-full object-contain p-2" />
                  ) : adopted?.text ? (
                    <span className="font-[cursive] text-2xl">{adopted.text}</span>
                  ) : (
                    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                      <PenLine className="size-4" />
                      {t("clickToSign")}
                    </span>
                  )}
                </button>
                <p className="mt-2 text-xs text-muted-foreground">Click a field on the document or choose a saved style here.</p>
              </div>
            ) : null}

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {remaining} remaining
              </p>
              <div className="mt-2 space-y-1.5">
                {(incomplete.length ? incomplete : ownFields).map((field) => (
                  <button
                    key={field.id}
                    type="button"
                    onClick={() => activate(field)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm",
                      field.completed ? "border-emerald-200 bg-emerald-50 text-emerald-900" : selectedFieldId === field.id ? "border-primary bg-primary/5" : "hover:bg-muted",
                    )}
                  >
                    <span className="truncate">{field.label ?? field.type}</span>
                    {field.completed ? <Check className="size-3.5" /> : null}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="border-t p-4">
            <Button className="w-full" size="lg" disabled={busy || !canFinish} onClick={() => void finish()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {finishLabel}
            </Button>
            {!session.organizationBrand.hidePlatformBranding ? (
              <p className="mt-2 text-center text-[10px] text-muted-foreground">Powered by Secure Sign</p>
            ) : null}
          </div>
        </aside>
      </div>

      <SignaturePickerDialog
        busy={busy}
        draft={draft}
        initials={pickerTarget?.type === "initials"}
        saved={readSaved(pickerTarget?.type === "initials" ? "initials" : "signature")}
        open={pickerOpen}
        onChangeDraft={setDraft}
        onOpenChange={(open) => {
          setPickerOpen(open);
          if (!open) {
            setPickerTarget(null);
          }
        }}
        onPick={(value) => {
          if (pickerTarget) {
            void applySignature(value, pickerTarget);
            return;
          }
          const next = { ...value, items: readSaved("signature")?.items };
          setAdopted(next);
          writeSaved("signature", next);
          setPickerOpen(false);
        }}
      />

      <Dialog open={Boolean(textTarget)} onOpenChange={(open) => !open && setTextTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{textTarget?.label ?? t("clickToFill")}</DialogTitle>
          </DialogHeader>
          <Input value={draft} onChange={(event) => setDraft(event.target.value)} />
          <DialogFooter>
            <Button
              disabled={busy || !draft.trim()}
              onClick={() => {
                if (!textTarget) return;
                const field = textTarget;
                setTextTarget(null);
                void fill(field, { text: draft.trim() });
              }}
            >
              {t("adoptSubmit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(choiceTarget)} onOpenChange={(open) => !open && setChoiceTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{choiceTarget?.label ?? t("clickToFill")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            {(choiceTarget?.options ?? []).map((option) => (
              <button
                key={option}
                type="button"
                disabled={busy}
                onClick={() => {
                  if (!choiceTarget) return;
                  const field = choiceTarget;
                  setChoiceTarget(null);
                  void fill(field, { text: option });
                }}
                className="flex w-full items-center rounded-xl border px-3 py-2.5 text-left text-sm transition hover:border-primary hover:bg-primary/5"
              >
                {option}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SignaturePickerDialog({
  open,
  busy,
  draft,
  initials,
  saved,
  onOpenChange,
  onChangeDraft,
  onPick,
}: {
  open: boolean;
  busy: boolean;
  draft: string;
  initials: boolean;
  saved: Appearance | null;
  onOpenChange: (open: boolean) => void;
  onChangeDraft: (value: string) => void;
  onPick: (value: Appearance) => void;
}) {
  const t = useTranslations("RecipientSigning");
  const padRef = useRef<SignaturePadHandle | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"saved" | "type" | "draw" | "upload">("saved");
  const [hasStroke, setHasStroke] = useState(false);
  const [fontId, setFontId] = useState("dancing");
  const [inkId, setInkId] = useState<"black" | "blue">("black");
  const [rendering, setRendering] = useState(false);
  const ink = signatureInkById(inkId);
  const savedChoices = saved?.items?.length ? saved.items : saved ? [saved] : [];

  useEffect(() => {
    if (open) {
      setTab(savedChoices.length ? "saved" : "type");
      setHasStroke(false);
    }
  }, [open, savedChoices.length]);

  const normalizeUpload = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const image = new window.Image();
      image.onload = () => {
        const scale = Math.min(1, 1000 / image.naturalWidth, 320 / image.naturalHeight);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Canvas unavailable"));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < pixels.data.length; i += 4) {
          const r = pixels.data[i];
          const g = pixels.data[i + 1];
          const b = pixels.data[i + 2];
          if (r > 245 && g > 245 && b > 245) {
            pixels.data[i + 3] = 0;
          }
        }
        context.putImageData(pixels, 0, 0);
        resolve(trimTransparentCanvas(canvas).toDataURL("image/png"));
        URL.revokeObjectURL(image.src);
      };
      image.onerror = reject;
      image.src = URL.createObjectURL(file);
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{initials ? "Choose initials" : t("adoptModalTitle")}</DialogTitle>
          <DialogDescription>{initials ? "Pick saved initials or create a new set." : t("adoptModalDesc")}</DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 rounded-xl border bg-muted p-1 text-xs font-semibold">
          {savedChoices.length ? (
            <button type="button" className={cn("flex-1 rounded-lg px-3 py-1.5", tab === "saved" ? "bg-background shadow-xs" : "text-muted-foreground")} onClick={() => setTab("saved")}>
              Saved
            </button>
          ) : null}
          <button type="button" className={cn("flex-1 rounded-lg px-3 py-1.5", tab === "type" ? "bg-background shadow-xs" : "text-muted-foreground")} onClick={() => setTab("type")}>
            {t("tabType")}
          </button>
          <button type="button" className={cn("flex-1 rounded-lg px-3 py-1.5", tab === "draw" ? "bg-background shadow-xs" : "text-muted-foreground")} onClick={() => setTab("draw")}>
            {t("tabDraw")}
          </button>
          <button type="button" className={cn("flex-1 rounded-lg px-3 py-1.5", tab === "upload" ? "bg-background shadow-xs" : "text-muted-foreground")} onClick={() => setTab("upload")}>
            Upload
          </button>
        </div>

        {tab === "saved" ? (
          <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto">
            {savedChoices.map((item, index) => (
              <button
                key={item.id ?? `${item.text}-${index}`}
                type="button"
                onClick={() => onPick(item)}
                className={cn("rounded-xl border bg-white p-3 text-left transition hover:border-primary hover:ring-2 hover:ring-primary/15", CHECKERBOARD_CLASS)}
              >
                <span className="flex h-16 items-center justify-center overflow-hidden">
                  {item.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt={item.name ?? "Saved appearance"} src={item.image} className="h-full w-full object-contain" />
                  ) : (
                    <span className={cn("text-2xl text-zinc-900", item.font ? signatureFontById(item.font).font.className : "font-[cursive]")}>{item.text}</span>
                  )}
                </span>
                <span className="mt-2 flex items-center justify-between gap-2 text-xs font-semibold text-zinc-800">
                  <span className="truncate">{item.name || (initials ? "My initials" : "My signature")}</span>
                  <span className="shrink-0 capitalize text-zinc-500">{item.source || "saved"}</span>
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {tab !== "saved" ? (
          <div className="space-y-3">
            <Input
              value={draft}
              onChange={(event) => onChangeDraft(event.target.value)}
              placeholder={initials ? t("initialsLabel") : t("fullNameLabel")}
            />
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex gap-2">
                {SIGNATURE_INK_COLORS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-label={item.label}
                    onClick={() => setInkId(item.id)}
                    className={cn("size-7 rounded-full border-2", inkId === item.id ? "border-primary" : "border-transparent")}
                    style={{ background: item.value }}
                  />
                ))}
              </div>
              {tab === "type" ? <SignatureFontPicker compact value={fontId} onChange={setFontId} /> : null}
            </div>

            {tab === "draw" ? (
              <>
                <div className={cn("overflow-hidden rounded-xl border", CHECKERBOARD_CLASS)}>
                  <SignaturePad handleRef={padRef} color={ink.value} onEmptyChange={(empty) => setHasStroke(!empty)} className="h-36 w-full touch-none bg-transparent" />
                </div>
                <p className="text-xs text-muted-foreground">{t("drawHint")}</p>
              </>
            ) : null}

            {tab === "type" ? (
              <div className={cn("grid h-36 place-items-center rounded-xl border", CHECKERBOARD_CLASS)}>
                <p className={cn("px-4 text-center text-3xl", signatureFontById(fontId).font.className)} style={{ color: ink.value }}>
                  {draft || " "}
                </p>
              </div>
            ) : null}

            {tab === "upload" ? (
              <>
                <input
                  ref={uploadRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file || !/image\/(png|jpeg)/.test(file.type)) {
                      return;
                    }
                    void normalizeUpload(file).then((image) => onPick({ text: draft.trim(), image, source: "upload" }));
                  }}
                />
                <button
                  type="button"
                  onClick={() => uploadRef.current?.click()}
                  className="grid min-h-36 w-full place-items-center rounded-xl border-2 border-dashed border-primary/30 bg-primary/3 text-center"
                >
                  <span>
                    <ImageUp className="mx-auto size-8 text-primary" />
                    <span className="mt-2 block text-sm font-semibold">Upload signature image</span>
                    <span className="mt-1 block text-xs text-muted-foreground">PNG or JPG up to 3 MB</span>
                  </span>
                </button>
              </>
            ) : null}
          </div>
        ) : null}

        {tab !== "saved" && tab !== "upload" ? (
          <DialogFooter>
            {tab === "draw" ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  padRef.current?.clear();
                  setHasStroke(false);
                }}
              >
                {t("clear")}
              </Button>
            ) : null}
            <Button
              disabled={busy || rendering || !draft.trim() || (tab === "draw" && !hasStroke)}
              onClick={() => {
                if (tab === "type") {
                  setRendering(true);
                  void renderTypedSignaturePng({ text: draft.trim(), fontId, color: ink.value, fontSize: initials ? 64 : 72 })
                    .then((image) => onPick({ text: draft.trim(), image, source: "type", font: fontId, color: ink.value }))
                    .catch(() => onPick({ text: draft.trim() }))
                    .finally(() => setRendering(false));
                  return;
                }
                const image = padRef.current?.toDataURL();
                if (!image) {
                  return;
                }
                onPick({ text: draft.trim(), image, source: "draw", color: ink.value });
              }}
            >
              {rendering ? <Loader2 className="size-4 animate-spin" /> : null}
              Use this {initials ? "initials" : "signature"}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
