"use client";

import { Loader2 } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { useMe } from "@/hooks/use-envelope-api";

export default function CompanySettingsPage() {
  const meQuery = useMe();
  const workspace = meQuery.data?.workspace;
  return (
    <main className="mx-auto w-full max-w-[800px] px-3 py-6 sm:px-0">
      <PageHeader title="Organization" description="The active workspace for this session." />
      {meQuery.isLoading || !workspace ? (
        <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading workspace…
        </div>
      ) : (
        <dl className="mt-8 space-y-4 rounded-3xl border bg-background p-6 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Name</dt>
            <dd className="mt-1 font-semibold">{workspace.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Slug</dt>
            <dd className="mt-1 font-mono text-sm">{workspace.slug}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Your role</dt>
            <dd className="mt-1 font-semibold capitalize">{workspace.role}</dd>
          </div>
        </dl>
      )}
    </main>
  );
}
