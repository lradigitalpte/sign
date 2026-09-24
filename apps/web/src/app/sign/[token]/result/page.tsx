"use client";

import { useSearchParams } from "next/navigation";
import { use } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function SigningResultPage({ params }: { params: Promise<{ token: string }> }) {
  use(params);
  const status = useSearchParams().get("status") ?? "declined";
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold capitalize">{status}</h1>
      <p className="mt-2 text-sm text-muted-foreground">This signing session has ended.</p>
      <Button asChild className="mt-6">
        <Link href="/inbox">Inbox</Link>
      </Button>
    </main>
  );
}
