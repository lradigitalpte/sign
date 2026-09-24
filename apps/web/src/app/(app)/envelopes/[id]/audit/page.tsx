"use client";

import { ArrowLeft, Download, History, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { use } from "react";

import { AuditTrailTimeline } from "@/components/envelopes/audit-trail-timeline";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { useEnvelope, useEnvelopeAudit } from "@/hooks/use-envelope-api";
import { certificateFilePath } from "@/lib/platform-api";

const statusTone = {
  draft: "neutral",
  in_progress: "warning",
  completed: "success",
  voided: "danger",
  expired: "danger",
} as const;

export default function EnvelopeAuditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const locale = useLocale();
  const t = useTranslations("AuditTrail");
  const tDetail = useTranslations("EnvelopeDetail");
  const envelopeQuery = useEnvelope(id);
  const auditQuery = useEnvelopeAudit(id);
  const events = auditQuery.data ?? [];
  const envelope = envelopeQuery.data;

  return (
    <main className="mx-auto w-full max-w-[960px] px-3 py-6 sm:px-5 lg:py-8">
      <Link
        href={`/envelopes/${id}`}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="size-3.5 rtl:rotate-180" />
        {t("backToEnvelope")}
      </Link>

      <div className="mt-6">
        <PageHeader
          title={t("title")}
          description={envelope?.title ?? id}
          actions={
            <Button asChild variant="outline" className="gap-2 shadow-xs">
              <a href={certificateFilePath(id)} target="_blank" rel="noreferrer">
                <Download className="size-4" />
                {t("downloadCertificate")}
              </a>
            </Button>
          }
        />
      </div>

      {envelope ? (
        <div className="mt-4">
          <StatusBadge tone={statusTone[envelope.status as keyof typeof statusTone] ?? "neutral"}>
            {tDetail(`statuses.${envelope.status}`)}
          </StatusBadge>
        </div>
      ) : null}

      {auditQuery.isLoading ? (
        <div className="mt-12 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("loading")}
        </div>
      ) : events.length === 0 ? (
        <EmptyState
          className="mt-10"
          icon={History}
          title={t("empty")}
          description={t("description")}
        />
      ) : (
        <AuditTrailTimeline events={events} locale={locale} />
      )}
    </main>
  );
}
