"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Copy,
  CopyPlus,
  Download,
  FileCheck,
  FilePenLine,
  FileText,
  History,
  Loader2,
  Send,
  ShieldCheck,
  Mail,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { use, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { EnvelopeAttachmentsPanel } from "@/components/envelopes/envelope-attachments-panel";
import { PageHeader } from "@/components/shared/page-header";
import { PdfPage, PdfPager } from "@/components/shared/pdf-page";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEnvelope, useEnvelopeDocuments, useEnvelopeRecipients, useMe, usePlatformToken } from "@/hooks/use-envelope-api";
import { accessInboxItem, ApiError, certificateFilePath, createEnvelopeShareLink, documentFilePath, duplicateEnvelope, remindEnvelope, updateEnvelope, voidEnvelope, type EnvelopeRecipient } from "@/lib/platform-api";
import { resumeSoloSelfSignIfApplicable } from "@/lib/self-sign-flow";

const statusTone = {
  draft: "neutral",
  in_progress: "warning",
  completed: "success",
  voided: "danger",
  expired: "danger",
} as const;

const recipientTone = {
  pending: "neutral",
  sent: "info",
  viewed: "warning",
  completed: "success",
  declined: "danger",
} as const;

export default function EnvelopeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("EnvelopeDetail");
  const tReview = useTranslations("ReviewSend");
  const router = useRouter();
  const queryClient = useQueryClient();
  const envelopeQuery = useEnvelope(id);
  const recipientsQuery = useEnvelopeRecipients(id);
  const documentsQuery = useEnvelopeDocuments(id);
  const { getAccessToken } = usePlatformToken();
  const me = useMe().data?.user;
  const envelope = envelopeQuery.data;
  const recipients = recipientsQuery.data ?? [];
  const documents = useMemo(() => documentsQuery.data ?? [], [documentsQuery.data]);
  const myPendingRecipient = useMemo(() => {
    const email = me?.email?.trim().toLowerCase();
    if (!email) {
      return null;
    }
    return recipients.find(
      (recipient) =>
        recipient.email.trim().toLowerCase() === email &&
        recipient.role !== "cc" &&
        (recipient.status === "sent" || recipient.status === "viewed"),
    ) ?? null;
  }, [me?.email, recipients]);
  const [copied, setCopied] = useState(false);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [renderedPages, setRenderedPages] = useState(1);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [savingTitle, setSavingTitle] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [openingSigning, setOpeningSigning] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const activeDocument = useMemo(
    () => documents.find((document) => document.id === activeDocumentId) ?? documents[0],
    [activeDocumentId, documents],
  );

  const startSigning = async (recipientId: string) => {
    setOpeningSigning(true);
    setActionError(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Not authenticated");
      }
      const access = await accessInboxItem(token, recipientId);
      router.push(`/inbox/sign/${encodeURIComponent(access.token)}`);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : t("signError"));
      setOpeningSigning(false);
    }
  };

  const signAgain = async () => {
    setDuplicating(true);
    setActionError(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Not authenticated");
      }
      const copy = await duplicateEnvelope(token, id);
      const resumed = await resumeSoloSelfSignIfApplicable(token, copy.id, me?.email, router);
      if (!resumed) {
        router.push(`/envelopes/${copy.id}/editor?self=1`);
      }
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : t("duplicateError"));
      setDuplicating(false);
    }
  };

  const displayHash =
    envelope?.status === "completed" && activeDocument?.completedSha256
      ? activeDocument.completedSha256
      : activeDocument?.sha256;

  const handleCopyHash = () => {
    if (!displayHash) {
      return;
    }
    navigator.clipboard?.writeText(displayHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (envelopeQuery.isLoading || recipientsQuery.isLoading || documentsQuery.isLoading) {
    return (
      <main className="mx-auto flex min-h-[50vh] w-full max-w-[1360px] items-center justify-center px-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("loading")}
        </div>
      </main>
    );
  }

  if (envelopeQuery.error || !envelope) {
    const notFound = envelopeQuery.error instanceof ApiError && envelopeQuery.error.status === 404;
    return (
      <main className="mx-auto w-full max-w-[640px] px-3 py-16 text-center">
        <p className="font-semibold">{notFound ? t("notFound") : t("loadError")}</p>
        <Button asChild className="mt-4">
          <Link href="/envelopes">{t("back")}</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1360px] px-3 py-6 sm:px-5 lg:px-8 lg:py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
          href="/envelopes"
        >
          <ArrowLeft className="size-3.5 rtl:rotate-180" />
          {t("back")}
        </Link>
        <StatusBadge tone={statusTone[envelope.status]}>{t(`statuses.${envelope.status}`)}</StatusBadge>
      </div>

      <PageHeader
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => router.push(`/envelopes/${id}/audit`)} className="gap-2 shadow-xs">
              <History className="size-4 text-primary" />
              <span>{t("viewAudit")}</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2 shadow-xs">
                  <Download className="size-4" />
                  <span>{t("download")}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{t("download")}</DropdownMenuLabel>
                {activeDocument ? (
                  <DropdownMenuItem asChild>
                    <a href={documentFilePath(id, activeDocument.id)} target="_blank" rel="noreferrer">
                      <FileText />
                      {t("downloadOriginal")}
                    </a>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem disabled>
                    <FileText />
                    {t("downloadOriginal")}
                  </DropdownMenuItem>
                )}
                {activeDocument?.completedSha256 ? (
                  <DropdownMenuItem asChild>
                    <a href={documentFilePath(id, activeDocument.id, "completed")} target="_blank" rel="noreferrer">
                      <FileCheck />
                      {t("downloadCompleted")}
                    </a>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem disabled>
                    <FileCheck />
                    {t("downloadCompleted")}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a href={certificateFilePath(id)} target="_blank" rel="noreferrer">
                    <ShieldCheck />
                    {t("downloadCertificate")}
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {envelope.status === "draft" ? (
              <Button asChild className="gap-2 shadow-sm">
                <Link href={`/envelopes/${id}/review`}>
                  <Send className="size-4" />
                  {t("continueReview")}
                </Link>
              </Button>
            ) : envelope.status === "in_progress" ? (
              <>
                {myPendingRecipient ? (
                  <Button className="gap-2 shadow-sm" disabled={openingSigning} onClick={() => void startSigning(myPendingRecipient.id)}>
                    {openingSigning ? <Loader2 className="size-4 animate-spin" /> : <FilePenLine className="size-4" />}
                    {t("signNow")}
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  className="gap-2 shadow-xs"
                  disabled={reminding}
                  onClick={async () => {
                    const token = await getAccessToken();
                    if (!token) {
                      return;
                    }
                    setReminding(true);
                    setActionError(null);
                    setActionNotice(null);
                    try {
                      const result = await remindEnvelope(token, id);
                      setActionNotice(t("reminderSent", { count: result.remindersQueued }));
                    } catch (caught) {
                      setActionError(caught instanceof ApiError ? caught.message : t("reminderError"));
                    } finally {
                      setReminding(false);
                    }
                  }}
                >
                  {reminding ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  {t("sendReminder")}
                </Button>
                <Button
                  variant="destructive"
                  className="gap-2 shadow-xs"
                  onClick={async () => {
                    const token = await getAccessToken();
                    if (!token) {
                      return;
                    }
                    await voidEnvelope(token, id);
                    await envelopeQuery.refetch();
                  }}
                >
                  {t("void")}
                </Button>
              </>
            ) : envelope.status === "completed" ? (
              <Button className="gap-2 shadow-sm" disabled={duplicating} onClick={() => void signAgain()}>
                {duplicating ? <Loader2 className="size-4 animate-spin" /> : <CopyPlus className="size-4" />}
                {t("duplicateAndSign")}
              </Button>
            ) : null}
          </div>
        }
        description={t("description", { count: recipients.length })}
        eyebrow={`Envelope ${id}`}
        title={envelope.title}
      />
      {envelope.status === "draft" ? (
        <form
          className="mt-4 flex max-w-xl items-center gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const next = (titleDraft ?? envelope.title).trim();
            if (!next || next === envelope.title) {
              return;
            }
            const token = await getAccessToken();
            if (!token) {
              return;
            }
            setSavingTitle(true);
            setActionError(null);
            try {
              await updateEnvelope(token, id, { title: next });
              await queryClient.invalidateQueries({ queryKey: ["envelope", id] });
              await queryClient.invalidateQueries({ queryKey: ["envelopes"] });
              setActionNotice(t("titleSaved"));
            } catch (caught) {
              setActionError(caught instanceof ApiError ? caught.message : t("loadError"));
            } finally {
              setSavingTitle(false);
            }
          }}
        >
          <Input value={titleDraft ?? envelope.title} onChange={(event) => setTitleDraft(event.target.value)} aria-label={t("saveTitle")} />
          <Button type="submit" variant="outline" disabled={savingTitle || !(titleDraft ?? envelope.title).trim() || (titleDraft ?? envelope.title).trim() === envelope.title}>
            {savingTitle ? <Loader2 className="size-4 animate-spin" /> : t("saveTitle")}
          </Button>
        </form>
      ) : null}
      {myPendingRecipient && envelope.status === "in_progress" ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
          <p className="text-sm font-medium">{t("waitingForYou")}</p>
          <Button size="sm" disabled={openingSigning} onClick={() => void startSigning(myPendingRecipient.id)}>
            {openingSigning ? <Loader2 className="size-4 animate-spin" /> : <FilePenLine className="size-4" />}
            {t("signNow")}
          </Button>
        </div>
      ) : null}
      {actionError ? <p className="mt-3 text-sm text-destructive">{actionError}</p> : null}
      {actionNotice ? <p className="mt-3 text-sm text-emerald-700">{actionNotice}</p> : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-12">
        <section className="flex flex-col gap-6 lg:col-span-8">
          <div className="clay-panel-soft rounded-3xl p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3 border-b pb-4">
              <div className="flex items-center gap-2 font-semibold text-foreground">
                <FileText className="size-4.5 text-primary" />
                <span>{t("documentPreview")}</span>
              </div>
              {documents.length > 1 ? (
                <div className="flex flex-wrap gap-1">
                  {documents.map((document) => (
                    <Button key={document.id} size="sm" variant={activeDocument?.id === document.id ? "default" : "outline"} onClick={() => { setActiveDocumentId(document.id); setPage(1); setRenderedPages(1); }}>
                      {document.filename}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
            {activeDocument ? (
              <div className="mt-5 flex flex-col items-center gap-3">
                <PdfPager page={page} pageCount={Math.max(activeDocument.pageCount, renderedPages)} onChange={setPage} />
                <PdfPage
                  src={documentFilePath(id, activeDocument.id, envelope.status === "completed" && activeDocument.completedSha256 ? "completed" : undefined)}
                  page={page}
                  width={640}
                  onDocumentLoad={({ pageCount }) => setRenderedPages(pageCount)}
                />
              </div>
            ) : (
              <div className="mt-5 grid min-h-[240px] place-items-center rounded-2xl border text-sm text-muted-foreground">{tReview("noDocuments")}</div>
            )}
          </div>
        </section>

        <aside className="flex flex-col gap-6 lg:col-span-4">
          <div className="clay-panel-soft rounded-3xl p-5 sm:p-6">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <Users className="size-4.5 text-primary" />
              <span>{t("recipientsTitle")}</span>
            </div>
            <div className="mt-4 space-y-3">
              {recipients.map((recipient) => (
                <RecipientCard
                  key={recipient.id}
                  isYou={Boolean(me?.email && recipient.email.trim().toLowerCase() === me.email.trim().toLowerCase())}
                  onSign={myPendingRecipient?.id === recipient.id ? () => void startSigning(recipient.id) : undefined}
                  openingSigning={openingSigning}
                  recipient={recipient}
                  onShare={async (mode) => {
                  try {
                    const accessToken = await getAccessToken(); if (!accessToken) throw new Error("Not authenticated");
                    const result = await createEnvelopeShareLink(accessToken, id, recipient.id);
                    const suffix = recipient.status === "completed" ? "/completed" : "";
                    const link = `${window.location.origin}/sign/${encodeURIComponent(result.token)}${suffix}`;
                    if (mode === "email") {
                      window.location.href = `mailto:${encodeURIComponent(recipient.email)}?subject=${encodeURIComponent(envelope.title)}&body=${encodeURIComponent(`Open this secure document link:\n\n${link}`)}`;
                    } else {
                      await navigator.clipboard.writeText(link); setActionNotice(`Secure link copied for ${recipient.name}.`);
                    }
                    } catch (caught) { setActionError(caught instanceof Error ? caught.message : "Unable to create secure link"); }
                  }}
                />
              ))}
            </div>
          </div>

          <EnvelopeAttachmentsPanel
            envelopeId={id}
            editable={envelope.status === "draft" || envelope.status === "in_progress"}
          />

          <div className="clay-panel-soft rounded-3xl p-5 text-xs sm:p-6">
            <h4 className="font-semibold text-foreground">{t("detailsCard")}</h4>
            <dl className="mt-3 divide-y divide-border/60">
              <div className="flex justify-between py-2">
                <dt className="text-muted-foreground">{t("created")}</dt>
                <dd className="font-medium text-foreground">{new Date(envelope.createdAt).toLocaleString()}</dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-muted-foreground">{t("expires")}</dt>
                <dd className="font-medium text-foreground">{envelope.expiresAt ? new Date(envelope.expiresAt).toLocaleDateString() : t("noExpiry")}</dd>
              </div>
            </dl>
            {displayHash ? (
              <div className="mt-4 rounded-xl border bg-background/80 p-3">
                <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                  <span>{t("securityHash")}</span>
                  <button type="button" onClick={handleCopyHash} className="flex items-center gap-1 text-primary hover:underline">
                    <Copy className="size-3" />
                    {copied ? t("copiedHash") : "Copy"}
                  </button>
                </div>
                <p className="mt-1 break-all font-mono text-[10px] text-foreground/80">{displayHash}</p>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </main>
  );
}

function RecipientCard({
  recipient,
  isYou,
  openingSigning,
  onShare,
  onSign,
}: {
  recipient: EnvelopeRecipient;
  isYou: boolean;
  openingSigning: boolean;
  onShare: (mode: "copy" | "email") => Promise<void>;
  onSign?: () => void;
}) {
  const t = useTranslations("EnvelopeDetail");
  const tReview = useTranslations("ReviewSend");
  const Icon = recipient.status === "completed" ? CheckCircle2 : Clock3;
  return (
    <div className="rounded-2xl border bg-card/80 p-3.5 shadow-xs">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {t("routingStep", { step: recipient.signingOrder })} • {tReview(`roles.${recipient.role}`)}
            {isYou ? ` · ${t("you")}` : ""}
          </span>
          <p className="mt-0.5 text-sm font-semibold text-foreground">{recipient.name}</p>
          <p className="truncate text-xs text-muted-foreground">{recipient.email}</p>
        </div>
        <StatusBadge tone={recipientTone[recipient.status]}>
          <Icon className="me-1 inline-block size-3" />
          {t(`recipientStatuses.${recipient.status}`)}
        </StatusBadge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
        {onSign ? (
          <Button size="sm" disabled={openingSigning} onClick={onSign}>
            {openingSigning ? <Loader2 className="size-4 animate-spin" /> : <FilePenLine />}
            {t("signNow")}
          </Button>
        ) : null}
        <Button size="sm" variant="outline" onClick={() => void onShare("copy")}><Copy />Copy secure link</Button>
        <Button size="sm" variant="outline" onClick={() => void onShare("email")}><Mail />Email</Button>
      </div>
    </div>
  );
}
