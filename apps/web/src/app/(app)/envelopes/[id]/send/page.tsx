"use client";

import { ArrowLeft, Loader2, Mail, Send, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { PreflightPanel } from "@/components/envelopes/preflight-panel";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEnvelope, useEnvelopeReview, usePlatformToken } from "@/hooks/use-envelope-api";
import { ApiError, sendEnvelope, updateEnvelope, type EnvelopeReview, type SendResult } from "@/lib/platform-api";

export default function ReviewAndSendPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("ReviewSend");
  const router = useRouter();
  const queryClient = useQueryClient();
  const { getAccessToken } = usePlatformToken();
  const reviewQuery = useEnvelopeReview(id);
  const envelopeQuery = useEnvelope(id);
  const review = reviewQuery.data;
  const envelope = envelopeQuery.data;

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);
  const idempotencyKey = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    if (!review?.title) {
      return;
    }
    setSubject((current) => current || envelope?.emailSubject || t("emailSubjectPlaceholder", { title: review.title }));
    setMessage((current) => current || envelope?.emailBody || "");
  }, [envelope?.emailBody, envelope?.emailSubject, review?.title, t]);

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!review?.ready || review.status !== "draft") {
      return;
    }
    setIsSending(true);
    setSendError(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error(t("loadError"));
      }
      await updateEnvelope(token, id, {
        emailSubject: subject.trim() || undefined,
        emailBody: message.trim() || undefined,
      });
      const sent = await sendEnvelope(token, id, idempotencyKey.current);
      setResult(sent);
      await queryClient.invalidateQueries({ queryKey: ["envelope-review", id] });
      await queryClient.invalidateQueries({ queryKey: ["envelope", id] });
      await queryClient.invalidateQueries({ queryKey: ["envelope-recipients", id] });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const payload = error.payload as { review?: EnvelopeReview; error?: string };
        if (payload.review) {
          queryClient.setQueryData(["envelope-review", id], payload.review);
        }
        if (error.message.includes("already been sent")) {
          setResult({ envelopeId: id, status: "in_progress", invitationsQueued: 0, idempotentReplay: true });
        } else {
          setSendError(error.message);
        }
      } else {
        setSendError(error instanceof Error ? error.message : t("loadError"));
      }
    } finally {
      setIsSending(false);
    }
  };

  if (reviewQuery.isLoading) {
    return (
      <main className="mx-auto flex min-h-[50vh] w-full max-w-[1200px] items-center justify-center px-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("loading")}
        </div>
      </main>
    );
  }

  if (reviewQuery.error || !review) {
    const notFound = reviewQuery.error instanceof ApiError && reviewQuery.error.status === 404;
    return (
      <main className="mx-auto w-full max-w-[640px] px-3 py-16 text-center">
        <p className="font-semibold">{notFound ? t("notFound") : t("loadError")}</p>
        <Button asChild className="mt-4">
          <Link href="/envelopes">{t("backToEnvelopes")}</Link>
        </Button>
      </main>
    );
  }

  const alreadySent = review.status !== "draft";
  const canSend = review.ready && !alreadySent && !isSending;

  return (
    <main className="mx-auto w-full max-w-[1200px] px-3 py-6 sm:px-5 lg:px-8 lg:py-8">
      <div className="mb-6">
        <Link
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
          href={`/envelopes/${id}/review`}
        >
          <ArrowLeft className="size-3.5 rtl:rotate-180" />
          {t("back")}
        </Link>
      </div>

      <PageHeader description={t("description")} eyebrow={review.title} title={t("title")} />

      <form onSubmit={handleSend} className="mt-8 grid gap-8 lg:grid-cols-12">
        <section className="flex flex-col gap-6 lg:col-span-8">
          <div className="clay-panel-soft rounded-3xl p-5 sm:p-6">
            <PreflightPanel review={review} />
            {alreadySent ? <p className="mt-3 text-xs text-muted-foreground">{t("alreadySent")}</p> : null}
            {sendError ? <p className="mt-3 text-xs text-destructive">{sendError}</p> : null}
          </div>

          <div className="clay-panel-soft rounded-3xl p-5 sm:p-6">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <Mail className="size-4.5 text-primary" />
              <span>{t("emailSettings")}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t("customEmailNote")}</p>
            <div className="mt-4 space-y-4">
              <div>
                <Label htmlFor="email-subj" className="text-xs font-semibold">
                  {t("emailSubject")}
                </Label>
                <Input id="email-subj" className="mt-1.5" value={subject} onChange={(event) => setSubject(event.target.value)} />
              </div>
              <div>
                <Label htmlFor="email-msg" className="text-xs font-semibold">
                  {t("emailMessage")}
                </Label>
                <textarea
                  id="email-msg"
                  rows={4}
                  className="mt-1.5 w-full rounded-xl border bg-background p-3 text-sm shadow-2xs outline-none focus:ring-3 focus:ring-ring/30"
                  placeholder={t("emailMessagePlaceholder")}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                />
              </div>
            </div>
          </div>
        </section>

        <aside className="flex flex-col gap-6 lg:col-span-4">
          <div className="clay-panel-soft rounded-3xl p-5 sm:p-6">
            <h4 className="text-sm font-semibold text-foreground">{t("recipients")}</h4>
            <div className="mt-3 space-y-3">
              {review.recipients.map((recipient) => (
                <div key={recipient.id} className="rounded-2xl border bg-card/80 p-3 text-xs shadow-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-foreground">
                      {t("stepLabel", { step: recipient.signingOrder })}: {recipient.name}
                    </span>
                    <StatusBadge tone={recipient.missingRequiredFields ? "warning" : "info"}>{t(`roles.${recipient.role}`)}</StatusBadge>
                  </div>
                  <p className="mt-1 truncate text-muted-foreground">{recipient.email}</p>
                  <p className="mt-1 text-[11px] font-medium text-primary">{t("fieldsMapped", { count: recipient.fieldCount })}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="clay-panel-soft flex flex-col gap-3 rounded-3xl p-5">
            {alreadySent ? (
              <Button size="lg" type="button" className="w-full rounded-xl text-base shadow-sm" onClick={() => router.push(`/envelopes/${id}`)}>
                {t("viewEnvelope")}
              </Button>
            ) : (
              <Button size="lg" type="submit" disabled={!canSend} className="w-full gap-2 rounded-xl text-base shadow-sm">
                {isSending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    <span>{t("sending")}</span>
                  </>
                ) : (
                  <>
                    <Send className="size-4" />
                    <span>{t("sendNow")}</span>
                  </>
                )}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => router.push(`/envelopes/${id}/review`)} className="w-full rounded-xl">
              {t("back")}
            </Button>
          </div>
        </aside>
      </form>

      <Dialog open={Boolean(result)} onOpenChange={(open) => !open && setResult(null)}>
        <DialogContent className="text-center sm:max-w-[460px]">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-600">
            <Sparkles className="size-7" />
          </div>
          <DialogHeader className="pt-3">
            <DialogTitle className="text-center text-lg">{t("sentSuccessTitle")}</DialogTitle>
            <DialogDescription className="text-center text-xs">{t("sentSuccessDesc")}</DialogDescription>
          </DialogHeader>
          <div className="my-3 space-y-1 rounded-2xl border bg-surface-subtle p-3.5 text-start font-mono text-xs">
            <p className="text-muted-foreground">
              {t("envelopeIdLabel")}: {id}
            </p>
            <p className="text-muted-foreground">
              {t("statusInProgress")}
            </p>
            <p className="text-muted-foreground">{t("invitationsQueued", { count: result?.invitationsQueued ?? 0 })}</p>
          </div>
          <DialogFooter className="sm:justify-center">
            <Button className="w-full rounded-xl" onClick={() => router.push(`/envelopes/${id}`)}>
              {t("viewEnvelope")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
