"use client";

import { ArrowRight, Download, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { PdfPage, PdfPager } from "@/components/shared/pdf-page";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApiError, declineSigning, getSigningSession, signingAttachmentPath, signingDocumentPath, viewSigningSession, type SigningSession } from "@/lib/platform-api";

export default function RecipientDocumentReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const t = useTranslations("RecipientSigning");
  const router = useRouter();
  const [session, setSession] = useState<SigningSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasConsented, setHasConsented] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [renderedPages, setRenderedPages] = useState(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await viewSigningSession(token).catch(async (caught) => {
          if (caught instanceof ApiError && caught.status === 409) {
            return getSigningSession(token);
          }
          throw caught;
        });
        if (!cancelled) {
          setSession(loaded);
          if (loaded.recipient.status === "completed") {
            router.replace(`/sign/${token}/completed`);
          }
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Unable to load signing session");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, t, token]);

  if (error) {
    return (
      <main className="grid flex-1 place-items-center px-6">
        <div className="max-w-md rounded-3xl border bg-background p-6 text-center">
          <p className="font-semibold">{error}</p>
        </div>
      </main>
    );
  }
  if (!session) {
    return (
      <main className="grid flex-1 place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </main>
    );
  }

  const document = session.documents[0];
  const isApprover = session.recipient.role === "approver";
  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col overflow-y-auto px-3 py-6 sm:px-6">
      <section className="clay-panel mb-6 rounded-3xl p-5 sm:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            {session.organizationBrand.logoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={session.organizationBrand.logoDataUrl} alt={session.organizationName} className="mb-1.5 h-8 max-w-[180px] object-contain" />
            ) : (
              <p className="text-xs font-semibold text-primary">{session.organizationName}</p>
            )}
            <h1 className="mt-1 text-xl font-bold sm:text-2xl">{session.envelope.title}</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {session.recipient.name} · {session.recipient.email} · {session.recipient.role}
            </p>
          </div>
          <div className="flex gap-2">
            {document ? (
              <Button asChild variant="outline" size="sm">
                <a href={signingDocumentPath(token, document.id)} target="_blank" rel="noreferrer">
                  <Download className="size-3.5" />
                  {t("downloadOriginal")}
                </a>
              </Button>
            ) : null}
            {session.canAct ? (
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeclineOpen(true)}>
                <XCircle className="size-3.5" />
                {isApprover ? t("declineApproval") : t("decline")}
              </Button>
            ) : null}
          </div>
        </div>
        {session.recipient.privateMessage ? (
          <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-xs">
            <p className="font-semibold">{t("privateMessageTitle")}</p>
            <p className="mt-1 text-muted-foreground">{session.recipient.privateMessage}</p>
          </div>
        ) : null}
        {session.attachments?.length ? (
          <div className="mt-4 rounded-2xl border p-4 text-xs">
            <p className="font-semibold">{t("attachmentsTitle")}</p>
            <ul className="mt-2 space-y-1">
              {session.attachments.map((attachment) => (
                <li key={attachment.id}>
                  {attachment.kind === "file" ? (
                    <a href={signingAttachmentPath(token, attachment.id)} className="text-primary hover:underline">
                      {attachment.label}
                      {attachment.filename ? ` (${attachment.filename})` : ""}
                    </a>
                  ) : (
                    <a href={attachment.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                      {attachment.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <label className="mt-5 flex items-start gap-3 rounded-2xl border p-4 text-xs">
          <input type="checkbox" checked={hasConsented} onChange={(event) => setHasConsented(event.target.checked)} className="mt-0.5 size-4 accent-primary" />
          <span>
            <span className="font-semibold">{isApprover ? t("consentAgreeApproval") : t("consentAgree")}</span>
            <p className="mt-1 text-muted-foreground">{isApprover ? t("disclosureApprovalText") : t("disclosureText")}</p>
          </span>
        </label>
      </section>
      {document ? (
        <div className="flex flex-col items-center gap-3">
          <PdfPager page={page} pageCount={Math.max(document.pageCount, renderedPages)} onChange={setPage} />
          <PdfPage src={signingDocumentPath(token, document.id)} page={page} width={720} onDocumentLoad={({ pageCount }) => setRenderedPages(pageCount)} />
        </div>
      ) : (
        <div className="grid min-h-[320px] place-items-center rounded-3xl border text-sm text-muted-foreground">No documents</div>
      )}
      <footer className="sticky bottom-4 mt-6 flex items-center justify-between rounded-3xl border bg-card/95 p-4 shadow-lg">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 text-emerald-600" />
          {isApprover ? t("approvalReady") : t("requiredFields", { count: session.remainingRequired })}
        </div>
        <Button size="lg" disabled={!hasConsented || !session.canAct} onClick={() => router.push(`/sign/${token}/sign`)}>
          {isApprover ? t("startApproving") : t("startSigning")}
          <ArrowRight />
        </Button>
      </footer>
      {!session.organizationBrand.hidePlatformBranding ? (
        <p className="mt-4 pb-2 text-center text-[11px] text-muted-foreground">Powered by Secure Sign</p>
      ) : null}
      <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isApprover ? t("declineApprovalTitle") : t("declineTitle")}</DialogTitle>
            <DialogDescription>{isApprover ? t("declineApprovalDesc") : t("declineDesc")}</DialogDescription>
          </DialogHeader>
          <textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder={t("declineReasonPlaceholder")} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclineOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={!reason.trim() || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await declineSigning(token, reason.trim());
                  router.push(`/sign/${token}/result?status=declined`);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("declineConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
