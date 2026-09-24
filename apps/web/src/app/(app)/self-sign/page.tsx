"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, FileText, Loader2, PenLine, ShieldCheck, Sparkles } from "lucide-react";
import { useLocale } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { DocumentDropzone, PreparingSignOverlay } from "@/components/shared/document-dropzone";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMe, usePlatformToken, useSignaturePreferences } from "@/hooks/use-envelope-api";
import { createEnvelope, createEnvelopeRecipient, uploadEnvelopeDocument } from "@/lib/platform-api";
import { openWorkspaceSigningSession } from "@/lib/self-sign-flow";
import { cn } from "@/lib/utils";

const maxUploadBytes = 25 * 1024 * 1024;

const steps = [
  { title: "Upload your PDF", body: "Drop a single document you want to sign yourself." },
  { title: "Apply signature & date", body: "Use your saved signature or create one in the studio." },
  { title: "Download or share", body: "Get the stamped PDF when you are done." },
] as const;

export default function SelfSignPage() {
  const locale = useLocale();
  const router = useRouter();
  const { getAccessToken } = usePlatformToken();
  const me = useMe().data?.user;
  const savedPreferences = useSignaturePreferences().data;
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [prepStep, setPrepStep] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectFile = (next: File) => {
    if (!(next.type === "application/pdf" || next.name.toLowerCase().endsWith(".pdf"))) {
      setError("Choose a PDF document.");
      return;
    }
    if (next.size > maxUploadBytes) {
      setError("The PDF must be 25 MB or smaller.");
      return;
    }
    setFile(next);
    setTitle(next.name.replace(/\.pdf$/i, ""));
    setError(null);
  };

  const begin = async () => {
    if (!file || !me || !title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Please sign in again.");
      if (savedPreferences?.signature) window.localStorage.setItem("yoursign.saved-signature", JSON.stringify(savedPreferences.signature));
      if (savedPreferences?.initials) window.localStorage.setItem("yoursign.saved-initials", JSON.stringify(savedPreferences.initials));

      setPrepStep("Creating secure envelope…");
      const envelope = await createEnvelope(token, {
        title: title.trim(),
        language: locale,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });

      setPrepStep("Uploading your PDF…");
      await uploadEnvelopeDocument(token, envelope.id, file);

      setPrepStep("Opening signing session…");
      const recipient = await createEnvelopeRecipient(token, envelope.id, {
        name: me.name,
        email: me.email,
        role: "signer",
        signingOrder: 1,
      });
      await openWorkspaceSigningSession(token, envelope.id, recipient.id, router);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to prepare this PDF.");
      setBusy(false);
      setPrepStep("");
    }
  };

  return (
    <>
      <PreparingSignOverlay open={busy} step={prepStep} />
      <main className="mx-auto w-full max-w-[1360px] px-3 py-6 sm:px-5 lg:px-8 lg:py-8">
        <PageHeader
          title="Sign a PDF yourself"
          description="Upload once, sign in the workspace, then download or share the completed copy."
        />

        <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="space-y-6">
            <DocumentDropzone
              disabled={busy}
              fileName={file?.name ?? null}
              label="Add your PDF"
              description="Drag & drop your document here, or click to browse."
              onFile={selectFile}
            />

            <AnimatePresence>
              {file ? (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="rounded-3xl border bg-background p-5 shadow-sm sm:p-6"
                >
                  <Label htmlFor="self-sign-title" className="text-sm font-semibold">
                    Document title
                  </Label>
                  <Input
                    id="self-sign-title"
                    className="mt-2 h-11 rounded-xl"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-700">
                      <Sparkles className="size-3.5" />
                      Ready to sign
                    </span>
                    {!savedPreferences?.signature ? (
                      <Link href="/signature" className="font-medium text-primary hover:underline">
                        Set up your signature first
                      </Link>
                    ) : null}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {error ? <p className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p> : null}

            <Button
              size="lg"
              className="h-12 w-full rounded-xl text-base shadow-sm"
              disabled={!file || !me || busy || !title.trim()}
              onClick={() => void begin()}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <PenLine className="size-4" />}
              {busy ? "Preparing secure signing session…" : "Continue to sign"}
              {!busy ? <ArrowRight className="size-4" /> : null}
            </Button>
          </section>

          <aside className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-3xl border bg-background p-5 shadow-sm sm:col-span-2 xl:col-span-1">
              <h2 className="font-semibold">How it works</h2>
              <ol className="mt-4 space-y-4">
                {steps.map((step, index) => (
                  <li key={step.title} className="flex gap-3">
                    <span
                      className={cn(
                        "grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold",
                        file && index === 0 ? "bg-emerald-500 text-white" : index === 1 && file ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{step.title}</p>
                      <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-3xl border bg-background p-5">
              <ShieldCheck className="size-6 text-primary" />
              <h2 className="mt-3 font-semibold">Your completed copy</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Your signature and date are stamped into a new PDF. The original file stays unchanged.
              </p>
            </div>

            <div className="rounded-3xl border bg-background p-5">
              <FileText className="size-6 text-primary" />
              <h2 className="mt-3 font-semibold">Ready to share</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                After signing, download the completed PDF or share it by email from the envelope page.
              </p>
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}
