"use client";

import { BookOpen, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { TemplatePickerTab } from "@/components/envelopes/template-picker-tab";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";

export default function TemplatesPage() {
  const router = useRouter();

  return (
    <main className="mx-auto w-full max-w-[1200px] px-3 py-6 sm:px-5 lg:px-8 lg:py-8 space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Template Library"
          description="Standardized legal contracts, NDAs, HR offer letters, and service agreements ready to customize and send for e-signature in seconds."
        />

        <div className="flex items-center gap-3">
          <Link href="/envelopes/new?tab=scratch&template=1">
            <Button variant="outline" className="gap-2 rounded-xl text-xs">
              <Plus className="size-3.5" />
              <span>Create Custom Template</span>
            </Button>
          </Link>
          <Link href="/envelopes/new?tab=upload">
            <Button className="gap-2 rounded-xl text-xs bg-[#a3e635] hover:bg-[#84cc16] text-black font-semibold shadow-xs">
              <Sparkles className="size-3.5" />
              <span>New Agreement</span>
            </Button>
          </Link>
        </div>
      </div>

      <div className="clay-panel-soft rounded-3xl p-5 sm:p-6">
        <TemplatePickerTab />
      </div>
    </main>
  );
}
