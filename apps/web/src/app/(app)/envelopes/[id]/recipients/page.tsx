"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  FileCheck,
  FileText,
  GripVertical,
  HelpCircle,
  Loader2,
  Mail,
  MessageSquare,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useEnvelope,
  useEnvelopeDocuments,
  useEnvelopeRecipients,
  useMe,
  usePlatformToken,
} from "@/hooks/use-envelope-api";
import {
  ApiError,
  createEnvelopeRecipient,
  deleteEnvelopeRecipient,
  formatBytes,
  updateEnvelopeRecipient,
  type EnvelopeRecipient,
} from "@/lib/platform-api";
import { cn } from "@/lib/utils";

type UiRole = "signer" | "approver" | "viewer" | "copy";

type DraftRow = {
  localId: string;
  serverId?: string;
  name: string;
  email: string;
  role: UiRole;
  privateMessage: string;
};

const ROLE_OPTIONS: {
  key: UiRole;
  label: string;
  desc: string;
  icon: typeof User;
  colorClass: string;
}[] = [
  {
    key: "signer",
    label: "Signer",
    desc: "Needs to sign and complete fields",
    icon: UserCheck,
    colorClass: "text-primary border-primary bg-primary/10",
  },
  {
    key: "approver",
    label: "Approver",
    desc: "Reviews & approves without signing",
    icon: ShieldCheck,
    colorClass: "text-amber-500 border-amber-500 bg-amber-500/10",
  },
  {
    key: "viewer",
    label: "Viewer",
    desc: "Can view and download document",
    icon: Eye,
    colorClass: "text-blue-500 border-blue-500 bg-blue-500/10",
  },
  {
    key: "copy",
    label: "CC",
    desc: "Receives copy on final completion",
    icon: Mail,
    colorClass: "text-neutral-400 border-neutral-400 bg-neutral-400/10",
  },
];

function toApiRole(role: UiRole): EnvelopeRecipient["role"] {
  return role === "copy" ? "cc" : role;
}

function fromApiRole(role: EnvelopeRecipient["role"]): UiRole {
  return role === "cc" ? "copy" : role;
}

function emptyRow(role: UiRole = "signer"): DraftRow {
  return {
    localId: crypto.randomUUID(),
    name: "",
    email: "",
    role,
    privateMessage: "",
  };
}

export default function RecipientsSetupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("Recipients");
  const router = useRouter();
  const queryClient = useQueryClient();
  const { getAccessToken } = usePlatformToken();

  const meQuery = useMe();
  const me = meQuery.data?.user;
  const envelopeQuery = useEnvelope(id);
  const recipientsQuery = useEnvelopeRecipients(id);
  const documentsQuery = useEnvelopeDocuments(id);

  const [signingOrder, setSigningOrder] = useState(true);
  const [rows, setRows] = useState<DraftRow[] | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDocPreview, setShowDocPreview] = useState(false);

  useEffect(() => {
    if (!recipientsQuery.data || rows !== null) {
      return;
    }
    if (recipientsQuery.data.length === 0) {
      setRows([emptyRow()]);
      return;
    }
    const ordered = [...recipientsQuery.data].sort(
      (a, b) => a.signingOrder - b.signingOrder || a.createdAt.localeCompare(b.createdAt),
    );
    setSigningOrder(
      new Set(ordered.map((recipient) => recipient.signingOrder)).size > 1 ||
        ordered.some((recipient) => recipient.signingOrder > 1),
    );
    setRows(
      ordered.map((recipient) => ({
        localId: recipient.id,
        serverId: recipient.id,
        name: recipient.name,
        email: recipient.email,
        role: fromApiRole(recipient.role),
        privateMessage: recipient.privateMessage ?? "",
      })),
    );
  }, [recipientsQuery.data, rows]);

  const addRecipient = (role: UiRole = "signer") => {
    setRows((current) => [...(current ?? []), emptyRow(role)]);
  };

  const addMyself = () => {
    if (!me) return;
    const myselfRow: DraftRow = {
      localId: crypto.randomUUID(),
      name: me.name || "Me",
      email: me.email,
      role: "signer",
      privateMessage: "",
    };

    // If only one empty row exists, replace it
    if (rows && rows.length === 1 && !rows[0].name.trim() && !rows[0].email.trim()) {
      setRows([myselfRow]);
    } else {
      setRows((current) => [...(current ?? []), myselfRow]);
    }
  };

  const updateRow = (localId: string, updates: Partial<DraftRow>) => {
    setRows((current) => (current ?? []).map((row) => (row.localId === localId ? { ...row, ...updates } : row)));
  };

  const moveRow = (fromIndex: number, toIndex: number) => {
    if (!rows || toIndex < 0 || toIndex >= rows.length || fromIndex === toIndex) return;
    const updated = [...rows];
    const [movedItem] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, movedItem);
    setRows(updated);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (index: number) => {
    if (draggedIndex !== null && draggedIndex !== index) {
      moveRow(draggedIndex, index);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const removeRecipient = async (row: DraftRow) => {
    if (!rows || rows.length <= 1) {
      return;
    }
    if (row.serverId) {
      try {
        const token = await getAccessToken();
        if (!token) {
          throw new Error(t("error"));
        }
        await deleteEnvelopeRecipient(token, id, row.serverId);
        await queryClient.invalidateQueries({ queryKey: ["envelope-recipients", id] });
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : t("error"));
        return;
      }
    }
    setRows((current) => (current ?? []).filter((item) => item.localId !== row.localId));
  };

  const handleContinue = async (event: React.FormEvent) => {
    event.preventDefault();
    const current = rows ?? [];
    const filled = current.filter((row) => row.name.trim() && (isTemplate || row.email.trim()));
    const incomplete = current
      .filter((row) => row.name.trim() || row.email.trim())
      .filter((row) => !row.name.trim() || (!isTemplate && !row.email.trim()));

    if (filled.length === 0 || incomplete.length > 0) {
      setError(t("atLeastOne"));
      return;
    }
    const emails = filled.map((row) => row.email.trim().toLowerCase()).filter(Boolean);
    if (new Set(emails).size !== emails.length) {
      setError(t("duplicateEmail"));
      return;
    }

    if (envelopeQuery.data && envelopeQuery.data.status !== "draft") {
      router.push(`/envelopes/${id}/editor`);
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error(t("error"));
      }
      for (const [index, row] of filled.entries()) {
        const payload = {
          name: row.name.trim(),
          email: row.email.trim(),
          role: toApiRole(row.role),
          signingOrder: signingOrder ? index + 1 : 1,
          privateMessage: row.privateMessage.trim() || undefined,
        };
        if (row.serverId) {
          await updateEnvelopeRecipient(token, id, row.serverId, payload);
        } else {
          await createEnvelopeRecipient(token, id, payload);
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["envelope-recipients", id] });
      await queryClient.invalidateQueries({ queryKey: ["envelope-review", id] });
      router.push(`/envelopes/${id}/editor`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t("error"));
      setIsSaving(false);
    }
  };

  if (envelopeQuery.error || recipientsQuery.error) {
    const notFound = envelopeQuery.error instanceof ApiError && envelopeQuery.error.status === 404;
    return (
      <main className="grid min-h-[60vh] place-items-center px-6">
        <div className="max-w-md rounded-3xl border bg-background p-6 text-center shadow-sm">
          <p className="font-semibold">{notFound ? t("notFound") : t("loadError")}</p>
          <Button asChild className="mt-4">
            <Link href="/envelopes">{t("backToEnvelopes")}</Link>
          </Button>
        </div>
      </main>
    );
  }

  if (envelopeQuery.isLoading || recipientsQuery.isLoading || rows === null) {
    return (
      <main className="grid min-h-[60vh] place-items-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("loading")}
        </div>
      </main>
    );
  }

  const recipients = rows;
  const docs = documentsQuery.data ?? [];
  const primaryDoc = docs[0];
  const isTemplate = envelopeQuery.data?.isTemplate ?? false;

  return (
    <main className="mx-auto w-full max-w-[1200px] px-3 py-6 sm:px-5 lg:px-8 lg:py-8">
      <div className="mb-6">
        <Link
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
          href="/envelopes"
        >
          <ArrowLeft className="size-3.5 rtl:rotate-180" />
          {t("backToEnvelopes")}
        </Link>
      </div>

      <PageHeader
        title={isTemplate ? "Template roles" : t("title")}
        description={
          isTemplate
            ? "Define the roles who'll act on this template — a name is enough. Leave the email blank and you'll fill in the real person each time you use it."
            : "Add and organize signers, approvers, and observers. Drag and drop rows to customize the signing sequence."
        }
      />

      {isTemplate ? (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-xs text-foreground">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
          <p>
            This is a template, so emails are optional here. Give each role a name like &ldquo;Customer&rdquo; or &ldquo;HR
            Manager,&rdquo; place their fields in the editor, and the real name and email get filled in every time someone uses
            this template.
          </p>
        </div>
      ) : null}

      <form onSubmit={handleContinue} className="mt-8 grid gap-8 lg:grid-cols-12">
        <section className="flex flex-col gap-6 lg:col-span-8">
          {/* Document Overview Card */}
          {primaryDoc && (
            <div className="rounded-3xl border bg-card/85 p-4 sm:p-5 shadow-xs backdrop-blur-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <FileText className="size-6" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-surface-subtle px-2 py-0.5 text-[10px] font-bold text-muted-foreground uppercase">
                      Agreement File
                    </span>
                    <span className="text-[11px] text-muted-foreground">{formatBytes(primaryDoc.sizeBytes)}</span>
                  </div>
                  <h4 className="truncate text-sm font-bold text-foreground mt-0.5">
                    {envelopeQuery.data?.title || primaryDoc.filename}
                  </h4>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Link href={`/envelopes/${id}/editor`}>
                  <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs rounded-xl">
                    <Eye className="size-3.5" />
                    Preview in Editor
                  </Button>
                </Link>
              </div>
            </div>
          )}

          {/* Sequential vs Parallel Signing Order Toggle */}
          <div className="clay-panel-soft flex items-center justify-between gap-4 rounded-3xl p-5 sm:p-6">
            <div className="space-y-1">
              <label htmlFor="signing-order-toggle" className="cursor-pointer select-none text-sm font-semibold flex items-center gap-2">
                <span>{t("signingOrder")}</span>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                  {signingOrder ? "Sequential (1 → 2 → 3)" : "Parallel (All at once)"}
                </span>
              </label>
              <p className="text-xs text-muted-foreground">
                {signingOrder
                  ? "Recipients sign one after another in the exact sequence shown below. Drag rows to reorder."
                  : "All recipients receive the signing invitation email simultaneously."}
              </p>
            </div>
            <input
              id="signing-order-toggle"
              type="checkbox"
              checked={signingOrder}
              onChange={(event) => setSigningOrder(event.target.checked)}
              className="size-5 cursor-pointer accent-primary"
            />
          </div>

          {/* Recipient Cards with Drag-and-Drop & Visual Role Selector */}
          <div className="space-y-4">
            {recipients.map((recipient, idx) => {
              const isDragging = draggedIndex === idx;
              const isOver = dragOverIndex === idx;

              return (
                <div
                  key={recipient.localId}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDrop={() => handleDrop(idx)}
                  className={cn(
                    "clay-panel-soft relative rounded-3xl p-5 sm:p-6 transition duration-150 border-2",
                    isDragging ? "opacity-40 border-dashed border-primary scale-[0.99]" : "border-transparent",
                    isOver && !isDragging ? "border-primary bg-primary/5 shadow-md" : "",
                  )}
                >
                  {/* Top Bar: Drag Handle + Number + Quick Move Arrows + Delete */}
                  <div className="flex items-center justify-between border-b pb-3.5">
                    <div className="flex items-center gap-2">
                      <div
                        className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground transition rounded-md hover:bg-muted"
                        title="Drag to reorder"
                      >
                        <GripVertical className="size-4" />
                      </div>

                      {signingOrder ? (
                        <span className="grid size-6 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow-xs">
                          {idx + 1}
                        </span>
                      ) : null}

                      <span className="text-sm font-bold text-foreground">
                        {recipient.name ? recipient.name : `Recipient ${idx + 1}`}
                      </span>

                      <span className="ms-1 rounded-md bg-surface-subtle px-2 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase">
                        {recipient.role}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      {signingOrder && recipients.length > 1 && (
                        <>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            disabled={idx === 0}
                            onClick={() => moveRow(idx, idx - 1)}
                            className="size-7 text-muted-foreground hover:text-foreground"
                            title="Move Up"
                          >
                            <ArrowUp className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            disabled={idx === recipients.length - 1}
                            onClick={() => moveRow(idx, idx + 1)}
                            className="size-7 text-muted-foreground hover:text-foreground"
                            title="Move Down"
                          >
                            <ArrowDown className="size-3.5" />
                          </Button>
                        </>
                      )}

                      {recipients.length > 1 ? (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => removeRecipient(recipient)}
                          className="size-7 text-muted-foreground hover:text-destructive"
                          aria-label={t("remove")}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  {/* Name & Email Fields */}
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs font-semibold">{isTemplate ? "Role name" : t("name")} *</Label>
                      <div className="relative mt-1.5">
                        <User className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          className="ps-9 h-10 rounded-xl"
                          placeholder={isTemplate ? "e.g. Customer, HR Manager, Signer 1" : "e.g. Alex Morgan"}
                          value={recipient.name}
                          onChange={(event) => updateRow(recipient.localId, { name: event.target.value })}
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs font-semibold">
                        {t("email")} {isTemplate ? <span className="font-normal text-muted-foreground">(optional)</span> : "*"}
                      </Label>
                      <div className="relative mt-1.5">
                        <Mail className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          className="ps-9 h-10 rounded-xl"
                          type="email"
                          placeholder={isTemplate ? "Leave blank — filled in per use" : "e.g. alex@company.com"}
                          value={recipient.email}
                          onChange={(event) => updateRow(recipient.localId, { email: event.target.value })}
                          required={!isTemplate}
                        />
                      </div>
                    </div>

                    {/* Visual Role Pills */}
                    <div className="sm:col-span-2 space-y-1.5">
                      <Label className="text-xs font-semibold">Recipient Role</Label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {ROLE_OPTIONS.map((opt) => {
                          const isSelected = recipient.role === opt.key;
                          const Icon = opt.icon;

                          return (
                            <button
                              key={opt.key}
                              type="button"
                              onClick={() => updateRow(recipient.localId, { role: opt.key })}
                              className={cn(
                                "flex flex-col items-start gap-1 rounded-2xl border p-2.5 text-left transition",
                                isSelected
                                  ? opt.colorClass + " ring-1 ring-primary/40 shadow-xs"
                                  : "border-border/80 bg-background/60 hover:bg-muted/60 text-muted-foreground hover:text-foreground",
                              )}
                            >
                              <div className="flex items-center justify-between w-full">
                                <div className="flex items-center gap-1.5 font-bold text-xs">
                                  <Icon className="size-3.5" />
                                  <span>{opt.label}</span>
                                </div>
                                {isSelected && <Check className="size-3.5" />}
                              </div>
                              <span className="text-[10px] leading-tight text-muted-foreground line-clamp-2">
                                {opt.desc}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Private Message Note */}
                    <div className="sm:col-span-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-1">
                        <MessageSquare className="size-3.5" />
                        <span>Private note for {recipient.name || "this recipient"} (Optional)</span>
                      </div>
                      <Input
                        className="h-9 text-xs rounded-xl"
                        placeholder="e.g. Please review section 4 before signing…"
                        value={recipient.privateMessage}
                        onChange={(event) => updateRow(recipient.localId, { privateMessage: event.target.value })}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => addRecipient("signer")}
              className="flex-1 w-full gap-2 rounded-2xl border-dashed py-5 text-xs font-bold shadow-xs hover:border-primary hover:bg-primary/5"
            >
              <Plus className="size-4" />
              <span>Add Another Recipient</span>
            </Button>

            {me?.email && !recipients.some((r) => r.email.toLowerCase() === me.email.toLowerCase()) && (
              <Button
                type="button"
                variant="outline"
                onClick={addMyself}
                className="w-full sm:w-auto gap-2 rounded-2xl py-5 text-xs font-bold shadow-xs hover:border-primary hover:bg-primary/5"
              >
                <UserPlus className="size-4 text-primary" />
                <span>Add Myself</span>
              </Button>
            )}
          </div>
        </section>

        {/* Sidebar Summary & Guard */}
        <aside className="flex flex-col gap-6 lg:col-span-4">
          <div className="clay-panel-soft rounded-3xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <Users className="size-4 text-primary" />
              <span>Recipient Summary</span>
            </div>

            <div className="divide-y text-xs text-muted-foreground">
              <div className="flex justify-between py-2">
                <span>Total recipients</span>
                <span className="font-bold text-foreground">{recipients.length}</span>
              </div>
              <div className="flex justify-between py-2">
                <span>Signers required</span>
                <span className="font-bold text-foreground">
                  {recipients.filter((row) => row.role === "signer").length}
                </span>
              </div>
              <div className="flex justify-between py-2">
                <span>Approvers / Observers</span>
                <span className="font-bold text-foreground">
                  {recipients.filter((row) => row.role !== "signer").length}
                </span>
              </div>
              <div className="flex justify-between py-2">
                <span>Routing scheme</span>
                <span className="font-bold text-foreground">
                  {signingOrder ? "Sequential (Ordered)" : "Parallel (Simultaneous)"}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border bg-card/60 p-5 text-xs text-muted-foreground shadow-xs">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
              <span>Token Security & Audit Policy</span>
            </div>
            <p className="mt-2 leading-5">
              Each recipient receives a unique, cryptographic single-use signing URL. Token hashes are stored server-side and automatically revoked upon completion or void.
            </p>
          </div>

          {error ? (
            <p className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-xs text-destructive">
              {error}
            </p>
          ) : null}

          <div className="clay-panel-soft flex flex-col gap-3 rounded-3xl p-5">
            <Button
              size="lg"
              type="submit"
              disabled={isSaving}
              className="w-full gap-2 rounded-xl text-base shadow-sm bg-[#a3e635] hover:bg-[#84cc16] text-black font-semibold"
            >
              {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
              <span>{isSaving ? t("saving") : isTemplate ? "Save Roles & Continue to Field Editor" : "Continue to Field Editor"}</span>
              {isSaving ? null : <ArrowRight className="size-4 rtl:rotate-180" />}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/envelopes")}
              className="w-full rounded-xl"
            >
              {t("backToEnvelopes")}
            </Button>
          </div>
        </aside>
      </form>
    </main>
  );
}
