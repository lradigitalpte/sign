"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Cloud,
  FilePenLine,
  FileText,
  FileUp,
  Globe,
  Loader2,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";

import { CloudImportTab } from "@/components/envelopes/cloud-import-tab";
import { ScratchDocumentBuilder } from "@/components/envelopes/scratch-document-builder";
import { TemplatePickerTab } from "@/components/envelopes/template-picker-tab";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePlatformToken } from "@/hooks/use-envelope-api";
import { ApiError, createEnvelope, formatBytes, uploadEnvelopeDocument } from "@/lib/platform-api";
import { cn } from "@/lib/utils";

const maxUploadBytes = 25 * 1024 * 1024;

type CreationMode = "upload" | "templates" | "scratch" | "cloud";

type LocalFile = {
  id: string;
  file: File;
  uploaded: boolean;
};

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function NewEnvelopeContent() {
  const t = useTranslations("NewEnvelope");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { getAccessToken } = usePlatformToken();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initialTab = (searchParams?.get("tab") as CreationMode) || "upload";
  const [activeMode, setActiveMode] = useState<CreationMode>(initialTab);
  const creatingTemplate = searchParams?.get("template") === "1";

  const [title, setTitle] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [envelopeId, setEnvelopeId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addFiles = (list: FileList | File[]) => {
    const accepted: LocalFile[] = [];
    let pdfOnly = false;
    let tooLarge = false;
    for (const file of Array.from(list)) {
      if (!isPdf(file)) {
        pdfOnly = true;
        continue;
      }
      if (file.size > maxUploadBytes) {
        tooLarge = true;
        continue;
      }
      accepted.push({ id: crypto.randomUUID(), file, uploaded: false });
    }
    if (accepted.length > 0) {
      setFiles((current) => [...current, ...accepted]);
      if (!title.trim() && accepted[0]?.file?.name) {
        setTitle(accepted[0].file.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " "));
      }
    }
    setError(tooLarge ? t("tooLarge") : pdfOnly ? t("pdfOnly") : null);
  };

  const removeFile = (id: string) => {
    setFiles((current) => current.filter((file) => file.id !== id || file.uploaded));
  };

  const handleContinue = async (event: React.FormEvent) => {
    event.preventDefault();
    const pending = files.filter((file) => !file.uploaded);
    if (!title.trim() || files.length === 0) {
      setError(t("needPdf"));
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error(t("error"));
      }
      let id = envelopeId;
      if (!id) {
        const envelope = await createEnvelope(token, {
          title: title.trim(),
          language: locale,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          isTemplate: creatingTemplate,
        });
        id = envelope.id;
        setEnvelopeId(id);
      }
      for (const item of pending) {
        await uploadEnvelopeDocument(token, id, item.file);
        setFiles((current) => current.map((file) => (file.id === item.id ? { ...file, uploaded: true } : file)));
      }
      await queryClient.invalidateQueries({ queryKey: ["envelopes"] });
      await queryClient.invalidateQueries({ queryKey: ["envelopes", "templates"] });
      router.push(`/envelopes/${id}/recipients`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t("error"));
      setIsSubmitting(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-[1200px] px-3 py-6 sm:px-5 lg:px-8 lg:py-8">
      <div className="mb-6">
        <Link
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
          href="/envelopes"
        >
          <ArrowLeft className="size-3.5 rtl:rotate-180" />
          {t("cancel")}
        </Link>
      </div>

      {creatingTemplate ? (
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
          <Sparkles className="size-3.5" />
          Creating a reusable template
        </div>
      ) : null}
      <PageHeader
        description={
          creatingTemplate
            ? "Upload or draft the document, then define roles instead of real people — you'll fill in the actual name and email each time you use it."
            : "Choose how you want to prepare your agreement: upload a file, pick from standard templates, draft clauses from scratch, or import from cloud storage."
        }
        title={creatingTemplate ? "New Template" : t("title")}
      />

      {/* Creation Mode Segmented Switcher */}
      <div className="mt-8 flex flex-wrap items-center gap-2 rounded-2xl border bg-card/70 p-1.5 shadow-xs backdrop-blur-sm">
        <button
          type="button"
          onClick={() => setActiveMode("upload")}
          className={cn(
            "flex flex-1 min-w-[140px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition",
            activeMode === "upload"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
          )}
        >
          <UploadCloud className="size-4" />
          <span>Upload PDF</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMode("templates")}
          className={cn(
            "flex flex-1 min-w-[140px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition",
            activeMode === "templates"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
          )}
        >
          <BookOpen className="size-4" />
          <span>Template Library</span>
          <span className="rounded-full bg-primary-foreground/20 px-1.5 py-0.2 text-[10px]">Popular</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMode("scratch")}
          className={cn(
            "flex flex-1 min-w-[140px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition",
            activeMode === "scratch"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
          )}
        >
          <FilePenLine className="size-4" />
          <span>Draft from Scratch</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMode("cloud")}
          className={cn(
            "flex flex-1 min-w-[140px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition",
            activeMode === "cloud"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
          )}
        >
          <Cloud className="size-4" />
          <span>Cloud & URL Import</span>
        </button>
      </div>

      {/* Mode 1: Upload Existing PDF */}
      {activeMode === "upload" && (
        <form onSubmit={handleContinue} className="mt-8 grid gap-8 lg:grid-cols-12">
          <section className="flex flex-col gap-6 lg:col-span-8">
            <div className="clay-panel-soft rounded-3xl p-5 sm:p-6">
              <Label className="text-sm font-semibold" htmlFor="envelope-title">
                {t("documentTitle")}
              </Label>
              <Input
                id="envelope-title"
                className="mt-2.5 h-11 rounded-xl bg-background text-base font-medium shadow-xs"
                placeholder={t("titlePlaceholder")}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
              />
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              className="hidden"
              onChange={(event) => {
                if (event.target.files) {
                  addFiles(event.target.files);
                }
                event.target.value = "";
              }}
            />

            <div
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                addFiles(event.dataTransfer.files);
              }}
              className={`relative flex flex-col items-center justify-center rounded-3xl border-2 border-dashed p-8 text-center transition-all sm:p-12 ${
                isDragging
                  ? "border-primary bg-primary/5 ring-4 ring-primary/10"
                  : "border-border/80 bg-background/60 hover:border-primary/50 hover:bg-primary/2"
              }`}
            >
              <div className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary shadow-inner">
                <UploadCloud className="size-7" />
              </div>
              <h3 className="mt-4 text-base font-semibold tracking-[-0.02em]">{t("dragDrop")}</h3>
              <p className="mt-1.5 max-w-sm text-xs leading-5 text-muted-foreground">{t("supportedFormats")}</p>
              <div className="mt-5 flex items-center gap-3">
                <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} className="rounded-xl shadow-xs">
                  <FileUp className="size-4" />
                  {t("selectFiles")}
                </Button>
              </div>
            </div>

            {files.length > 0 && (
              <div className="clay-panel-soft rounded-3xl p-5 sm:p-6">
                <h4 className="text-sm font-semibold text-foreground">
                  {t("uploadedDocuments")} ({files.length})
                </h4>
                <div className="mt-4 space-y-3">
                  {files.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-4 rounded-2xl border bg-card/90 p-3.5 shadow-xs transition hover:shadow-sm"
                    >
                      <div className="flex min-w-0 items-center gap-3.5">
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                          <FileText className="size-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">{item.file.name}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{formatBytes(item.file.size)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="size-3.5" />
                          <span className="hidden sm:inline">{item.uploaded ? t("ready") : t("queued")}</span>
                        </span>
                        {!item.uploaded ? (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => removeFile(item.id)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <aside className="flex flex-col gap-6 lg:col-span-4">
            <div className="rounded-3xl border bg-card/60 p-5 text-xs text-muted-foreground shadow-xs">
              <div className="flex items-center gap-2 font-semibold text-foreground">
                <AlertCircle className="size-4 text-emerald-600 dark:text-emerald-400" />
                <span>Security & Integrity Guard</span>
              </div>
              <ul className="mt-2.5 list-disc space-y-1.5 ps-4 leading-5">
                <li>Original PDFs are stored immutably with SHA-256 validation.</li>
                <li>Multi-tenant isolation enforced via PostgreSQL RLS.</li>
                <li>All drafting mutations produce secure audit events.</li>
              </ul>
            </div>

            {error ? (
              <p className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-xs text-destructive">{error}</p>
            ) : null}

            <div className="clay-panel-soft flex flex-col gap-3 rounded-3xl p-5">
              <Button size="lg" type="submit" disabled={files.length === 0 || !title.trim() || isSubmitting} className="w-full gap-2 rounded-xl text-base shadow-sm bg-[#a3e635] hover:bg-[#84cc16] text-black font-semibold">
                {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
                <span>{isSubmitting ? t("creating") : t("continue")}</span>
                {isSubmitting ? null : <ArrowRight className="size-4 rtl:rotate-180" />}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.push("/envelopes")} className="w-full rounded-xl">
                {t("cancel")}
              </Button>
            </div>
          </aside>
        </form>
      )}

      {/* Mode 2: Template Library */}
      {activeMode === "templates" && (
        <div className="mt-8">
          <TemplatePickerTab />
        </div>
      )}

      {/* Mode 3: Draft from Scratch */}
      {activeMode === "scratch" && (
        <div className="mt-8">
          <ScratchDocumentBuilder />
        </div>
      )}

      {/* Mode 4: Cloud & URL Import */}
      {activeMode === "cloud" && (
        <div className="mt-8">
          <CloudImportTab />
        </div>
      )}
    </main>
  );
}

export default function NewEnvelopePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-muted-foreground">Loading workspace…</div>}>
      <NewEnvelopeContent />
    </Suspense>
  );
}
