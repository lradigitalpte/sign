"use client";

import { CheckCircle2, Download, Loader2, Mail, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { use, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { getSigningSession, signingDocumentPath, type SigningSession } from "@/lib/platform-api";

export default function SigningCompletedPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const t = useTranslations("RecipientSigning");
  const [session, setSession] = useState<SigningSession | null>(null);

  useEffect(() => {
    getSigningSession(token)
      .then(setSession)
      .catch(() => setSession(null));
  }, [token]);

  if (!session) {
    return (
      <main className="grid flex-1 place-items-center">
        <Loader2 className="size-5 animate-spin" />
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-[680px] flex-1 flex-col items-center justify-center px-4 py-12 text-center">
      <CheckCircle2 className="size-16 text-emerald-600" />
      <h1 className="mt-6 text-2xl font-bold">{t("completedTitle")}</h1>
      <p className="mt-3 text-sm text-muted-foreground">{t("completedDesc", { title: session.envelope.title })}</p>
      <div className="mt-8 w-full rounded-3xl border p-6 text-start text-sm">
        <p>
          <span className="text-muted-foreground">Document: </span>
          {session.envelope.title}
        </p>
        <p className="mt-2">
          <span className="text-muted-foreground">Signed by: </span>
          {session.recipient.name} ({session.recipient.email})
        </p>
        <p className="mt-2">
          <span className="text-muted-foreground">Status: </span>
          {session.recipient.status}
        </p>
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {session.documents[0] ? (
          <Button asChild>
            <a href={signingDocumentPath(token, session.documents[0].id)} target="_blank" rel="noreferrer"><Download /> Download signed PDF</a>
          </Button>
        ) : null}
        <Button variant="outline" onClick={() => {
          const subject = encodeURIComponent(`Signed document: ${session.envelope.title}`);
          const body = encodeURIComponent(`The signed document is ready. Open the secure link to view or download it:\n\n${window.location.href}`);
          window.location.href = `mailto:?subject=${subject}&body=${body}`;
        }}><Mail /> Email</Button>
        <Button variant="outline" onClick={async () => {
          if (navigator.share) {
            await navigator.share({ title: session.envelope.title, text: "Signed document", url: window.location.href });
          } else {
            await navigator.clipboard.writeText(window.location.href);
          }
        }}><Share2 /> Share</Button>
        <Button asChild variant="ghost"><Link href="/inbox">Inbox</Link></Button>
      </div>
    </main>
  );
}
