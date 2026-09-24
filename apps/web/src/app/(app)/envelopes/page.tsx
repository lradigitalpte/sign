"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Suspense } from "react";

import { EnvelopesTable } from "@/components/envelopes/envelopes-table";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";

export default function EnvelopesPage() {
  const t = useTranslations("Envelopes");
  return (
    <main className="mx-auto w-full max-w-[1440px] px-1 pb-3 pt-5 sm:px-3 sm:pb-5 sm:pt-6 lg:px-5 lg:pb-5 lg:pt-7">
      <section className="clay-panel relative overflow-hidden rounded-[2rem] p-4 sm:p-6 lg:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <PageHeader description={t("description")} title={t("title")} />
          <Button asChild className="gap-2 rounded-xl shadow-sm">
            <Link href="/envelopes/new">
              <Plus className="size-4" />
              <span>{t("newEnvelope")}</span>
            </Link>
          </Button>
        </div>
        <div className="mt-6">
          <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-card" />}>
            <EnvelopesTable />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
