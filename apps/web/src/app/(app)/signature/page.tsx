"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/shared/page-header";
import { SignatureStudio } from "@/components/signing/signature-studio";
import { Button } from "@/components/ui/button";
import { useMe, useSignaturePreferences } from "@/hooks/use-envelope-api";

export default function SignatureStudioPage() {
  const meQuery = useMe();
  const preferencesQuery = useSignaturePreferences();
  const user = meQuery.data?.user;

  return (
    <main className="mx-auto w-full max-w-[1480px] px-3 py-6 sm:px-5 lg:px-7 lg:py-8 xl:px-9">
      <PageHeader
        description="Create, save, and download your signature and initials for signing documents."
        title="Signature studio"
      />
      {meQuery.isLoading || preferencesQuery.isLoading || !user ? (
        <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading signature studio…
        </div>
      ) : (
        <div className="mt-7">
          <SignatureStudio
            key={JSON.stringify(preferencesQuery.data ?? {})}
            initial={preferencesQuery.data ?? {}}
            defaultName={user.name}
          />
        </div>
      )}
    </main>
  );
}
