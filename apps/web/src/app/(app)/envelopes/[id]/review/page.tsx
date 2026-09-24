"use client";

import { ArrowLeft, ArrowRight, AlertCircle, CheckCircle2, FileCheck2, FileText, Loader2, Settings2, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { use, useMemo, useState } from "react";

import { PreflightPanel } from "@/components/envelopes/preflight-panel";
import { PdfPage, PdfPager } from "@/components/shared/pdf-page";
import { Button } from "@/components/ui/button";
import { useEnvelope, useEnvelopeFields, useEnvelopeReview } from "@/hooks/use-envelope-api";
import { ApiError, documentFilePath, initialsFor, languageLabel, recipientPalette, recipientTones } from "@/lib/platform-api";

export default function ReviewPdfPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("ReviewSend");
  const reviewQuery = useEnvelopeReview(id);
  const envelopeQuery = useEnvelope(id);
  const fieldsQuery = useEnvelopeFields(id);
  const review = reviewQuery.data;
  const envelope = envelopeQuery.data;
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [renderedPages, setRenderedPages] = useState(1);
  const documents = useMemo(() => review?.documents ?? [], [review?.documents]);
  const fields = fieldsQuery.data ?? [];
  const selectedDocument = useMemo(
    () => documents.find((document) => document.id === activeDocumentId) ?? documents[0],
    [activeDocumentId, documents],
  );

  if (reviewQuery.isLoading || envelopeQuery.isLoading || fieldsQuery.isLoading) {
    return (
      <div className="grid h-[calc(100dvh-4.5rem)] place-items-center bg-surface-subtle">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("loading")}
        </div>
      </div>
    );
  }

  if (reviewQuery.error || envelopeQuery.error || fieldsQuery.error || !review || !envelope) {
    const notFound = reviewQuery.error instanceof ApiError && reviewQuery.error.status === 404;
    return (
      <div className="grid h-[calc(100dvh-4.5rem)] place-items-center bg-surface-subtle px-6">
        <div className="max-w-md rounded-3xl border bg-background p-6 text-center shadow-sm">
          <p className="font-semibold">{notFound ? t("notFound") : t("loadError")}</p>
          <Button asChild className="mt-4">
            <Link href="/envelopes">{t("backToEnvelopes")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  const alreadySent = envelope.status !== "draft";
  const continueHref = alreadySent ? `/envelopes/${id}` : `/envelopes/${id}/send`;
  const continueLabel = alreadySent ? t("viewEnvelope") : t("continueToSend");

  return (
    <div className="flex h-[calc(100dvh-4.5rem)] min-h-0 flex-col overflow-hidden bg-surface-subtle">
      <header className="flex h-16 shrink-0 items-center justify-between border-b bg-background px-4 shadow-xs sm:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <Link href={`/envelopes/${id}/editor`} className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground">
            <ArrowLeft className="size-3.5" /> {t("editFields")}
          </Link>
          <span className="hidden h-5 w-px bg-border sm:block" />
          <div className="hidden min-w-0 items-center gap-2 sm:flex">
            <FileText className="size-4 shrink-0 text-primary" />
            <span className="truncate text-sm font-semibold">{review.title}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!alreadySent ? (
            <Button asChild variant="outline" className="hidden sm:inline-flex">
              <Link href={`/envelopes/${id}/editor`}>
                <Settings2 />
                {t("makeChanges")}
              </Link>
            </Button>
          ) : null}
          {alreadySent || review.ready ? (
            <Button asChild>
              <Link href={continueHref}>
                {continueLabel} <ArrowRight />
              </Link>
            </Button>
          ) : (
            <Button disabled>
              {continueLabel} <ArrowRight />
            </Button>
          )}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[1fr_340px]">
        <main className="min-h-0 overflow-auto bg-slate-200/70 p-4 dark:bg-slate-950/70 sm:p-8">
          <div className="mx-auto mb-4 flex max-w-[760px] flex-col gap-3 rounded-xl border bg-background/95 px-3 py-2 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold">{t("reviewPdfTitle")}</p>
              <p className="text-[11px] text-muted-foreground">{t("reviewPdfSubtitle")}</p>
            </div>
            {documents.length > 1 ? (
              <div className="flex flex-wrap gap-1">
                {documents.map((document) => (
                  <Button
                    key={document.id}
                    size="sm"
                    variant={selectedDocument?.id === document.id ? "default" : "outline"}
                    onClick={() => {
                      setActiveDocumentId(document.id);
                      setPage(1);
                      setRenderedPages(1);
                    }}
                  >
                    {document.filename}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>

          {selectedDocument ? (
            <div className="mx-auto flex max-w-[760px] flex-col items-center gap-3">
              <PdfPager page={page} pageCount={Math.max(selectedDocument.pageCount, renderedPages)} onChange={setPage} />
              <PdfPage
                src={documentFilePath(id, selectedDocument.id)}
                page={page}
                width={720}
                onDocumentLoad={({ pageCount }) => setRenderedPages(pageCount)}
              >
                {fields
                  .filter((field) => field.documentId === selectedDocument.id && field.page === page)
                  .map((field) => {
                    const recipientIndex = Math.max(0, review.recipients.findIndex((recipient) => recipient.id === field.recipientId));
                    const recipient = review.recipients[recipientIndex];
                    const style = recipientPalette[recipientIndex % recipientPalette.length];
                    return (
                      <div
                        key={field.id}
                        style={{
                          left: `${field.x}%`,
                          top: `${field.y}%`,
                          width: `${field.width}%`,
                          height: `${field.height}%`,
                          borderColor: style.color,
                          backgroundColor: `${style.color}1a`,
                        }}
                        className="absolute z-10 flex items-center gap-2 overflow-hidden rounded-lg border-2 px-2 font-sans shadow-sm"
                      >
                        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: style.color }} />
                        <span className="min-w-0 truncate text-[10px] font-semibold text-slate-900">
                          {field.label?.trim() || field.type.replace(/^./, (value) => value.toUpperCase())}
                          {recipient ? ` · ${recipient.name}` : ""}
                        </span>
                      </div>
                    );
                  })}
              </PdfPage>
            </div>
          ) : (
            <div className="mx-auto grid min-h-[420px] max-w-[760px] place-items-center rounded-sm border bg-white text-sm text-muted-foreground shadow-2xl">
              {t("noDocuments")}
            </div>
          )}
        </main>

        <aside className="min-h-0 overflow-y-auto border-s bg-background p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <FileCheck2 className="size-5 text-primary" />
            <h2 className="font-semibold">{review.ready ? t("readyToSend") : t("notReadyTitle")}</h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{alreadySent ? t("alreadySent") : t("reviewSidebarHint")}</p>
          <div className="mt-5">
            <PreflightPanel review={review} />
          </div>
          <section className="mt-6">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Users className="size-4 text-primary" />
              {t("recipients")}
            </div>
            <div className="mt-3 space-y-2">
              {review.recipients.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("noRecipients")}</p>
              ) : (
                review.recipients.map((recipient, index) => (
                  <div key={recipient.id} className="flex items-center gap-3 rounded-xl border p-3">
                    <span className={`grid size-9 place-items-center rounded-full text-xs font-bold text-white ${recipientTones[index % recipientTones.length]}`}>
                      {initialsFor(recipient.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {recipient.signingOrder}. {recipient.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t(`roles.${recipient.role}`)} · {t("fieldsMapped", { count: recipient.fieldCount })}
                      </p>
                    </div>
                    {recipient.missingRequiredFields ? (
                      <AlertCircle className="size-4 text-amber-500" />
                    ) : (
                      <CheckCircle2 className="size-4 text-primary" />
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
          <section className="mt-6 rounded-2xl border p-4">
            <h3 className="text-sm font-semibold">{t("documentSettings")}</h3>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("language")}</dt>
                <dd>{languageLabel(envelope.language)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("timezone")}</dt>
                <dd>{envelope.timezone}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("documents")}</dt>
                <dd>{review.documents.length}</dd>
              </div>
            </dl>
          </section>
          {alreadySent || review.ready ? (
            <Button asChild size="lg" className="mt-6 w-full">
              <Link href={continueHref}>
                {continueLabel} <ArrowRight />
              </Link>
            </Button>
          ) : (
            <Button size="lg" className="mt-6 w-full" disabled>
              {continueLabel} <ArrowRight />
            </Button>
          )}
          <Button asChild variant="outline" className="mt-2 w-full">
            <Link href={`/envelopes/${id}/editor`}>{t("backToEditor")}</Link>
          </Button>
        </aside>
      </div>
    </div>
  );
}
