"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpen,
  Check,
  Clock,
  Eye,
  FileCheck,
  FileText,
  Filter,
  Layers,
  Loader2,
  Search,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

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
import { useTemplates, usePlatformToken } from "@/hooks/use-envelope-api";
import { createContractPdfFile } from "@/lib/pdf-builder";
import { createEnvelope, duplicateEnvelope, uploadEnvelopeDocument } from "@/lib/platform-api";
import { STANDARD_TEMPLATES, type AgreementTemplate } from "@/lib/templates-data";
import { cn } from "@/lib/utils";

type Props = {
  onSuccessRedirect?: (envelopeId: string) => void;
};

export function TemplatePickerTab({ onSuccessRedirect }: Props) {
  const router = useRouter();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const { getAccessToken } = usePlatformToken();
  const myTemplates = useTemplates();

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [previewTemplate, setPreviewTemplate] = useState<AgreementTemplate | null>(null);
  const [isInstantiating, setIsInstantiating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const categories = ["All", "General & Legal", "Employment & HR", "Sales & Services", "Tech & IP"];

  const filteredTemplates = useMemo(() => {
    return STANDARD_TEMPLATES.filter((t) => {
      const matchCat = selectedCategory === "All" || t.category === selectedCategory;
      const matchQuery =
        !search.trim() ||
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        t.description.toLowerCase().includes(search.toLowerCase());
      return matchCat && matchQuery;
    });
  }, [search, selectedCategory]);

  const handleUseTemplate = async (template: AgreementTemplate) => {
    setIsInstantiating(template.id);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Authentication required to create envelope.");
      }

      // 1. Generate PDF File from template definition
      const pdfFile = createContractPdfFile(template.draft, template.id);

      // 2. Create Envelope
      const created = await createEnvelope(token, {
        title: template.title,
        language: locale,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });

      // 3. Upload Generated PDF
      await uploadEnvelopeDocument(token, created.id, pdfFile);

      await queryClient.invalidateQueries({ queryKey: ["envelopes"] });

      if (onSuccessRedirect) {
        onSuccessRedirect(created.id);
      } else {
        router.push(`/envelopes/${created.id}/recipients`);
      }
    } catch (caught: any) {
      setError(caught?.message || "Failed to initialize template.");
      setIsInstantiating(null);
    }
  };

  const handleUseMyTemplate = async (templateId: string) => {
    setIsInstantiating(templateId);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Authentication required to create envelope.");
      }
      const created = await duplicateEnvelope(token, templateId);
      await queryClient.invalidateQueries({ queryKey: ["envelopes"] });

      if (onSuccessRedirect) {
        onSuccessRedirect(created.id);
      } else {
        router.push(`/envelopes/${created.id}/recipients`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to create envelope from template.");
      setIsInstantiating(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* My Templates */}
      {myTemplates.isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Loading your templates…
        </div>
      ) : (myTemplates.data?.length ?? 0) > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Star className="size-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">My Templates</h3>
            <span className="rounded-md bg-surface-subtle px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {myTemplates.data?.length}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {myTemplates.data?.map((template) => {
              const isBusy = isInstantiating === template.id;
              return (
                <div
                  key={template.id}
                  className="group flex items-center justify-between gap-3 rounded-2xl border bg-card/90 p-4 shadow-xs transition hover:border-primary/40 hover:shadow-md"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <FileCheck className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{template.title}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {(template.recipients?.length ?? 0)} role{(template.recipients?.length ?? 0) === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={Boolean(isInstantiating)}
                      onClick={() => router.push(`/envelopes/${template.id}/recipients`)}
                      className="gap-1.5 text-xs"
                    >
                      <span>Edit</span>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={isBusy || Boolean(isInstantiating)}
                      onClick={() => void handleUseMyTemplate(template.id)}
                      className="gap-1.5 text-xs"
                    >
                      {isBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                      <span>{isBusy ? "Preparing…" : "Use"}</span>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {(myTemplates.data?.length ?? 0) > 0 && (
        <div className="flex items-center gap-2">
          <BookOpen className="size-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">Standard Templates</h3>
        </div>
      )}

      {/* Search & Category Filter Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates (e.g., NDA, Contractor, Offer)…"
            className="h-10 ps-10 rounded-xl"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold transition shrink-0",
                selectedCategory === cat
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-surface-subtle text-muted-foreground hover:bg-muted/80 hover:text-foreground",
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          {error}
        </div>
      ) : null}

      {/* Templates Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {filteredTemplates.map((template) => {
          const isBusy = isInstantiating === template.id;

          return (
            <div
              key={template.id}
              className="group relative flex flex-col justify-between rounded-3xl border bg-card/90 p-5 shadow-xs transition hover:border-primary/40 hover:shadow-md"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary">
                      <FileCheck className="size-5" />
                    </span>
                    <div>
                      <span className="rounded-md bg-surface-subtle px-2 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        {template.category}
                      </span>
                      <h4 className="mt-1 text-sm font-bold text-foreground leading-snug">
                        {template.title}
                      </h4>
                    </div>
                  </div>
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold text-primary shrink-0">
                    {template.badge}
                  </span>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  {template.description}
                </p>

                {/* Meta details */}
                <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3 text-primary" />
                    ~{template.estimatedMinutes} min setup
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="size-3 text-primary" />
                    {template.roles.length} Signers
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Layers className="size-3 text-primary" />
                    {template.draft.sections.length} Clauses
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-5 flex items-center justify-between gap-2 border-t pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPreviewTemplate(template)}
                  className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Eye className="size-3.5" />
                  Preview clauses
                </Button>

                <Button
                  type="button"
                  size="sm"
                  disabled={isBusy || Boolean(isInstantiating)}
                  onClick={() => void handleUseTemplate(template)}
                  className="bg-[#a3e635] hover:bg-[#84cc16] text-black font-semibold shadow-xs gap-1.5 transition"
                >
                  {isBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                  <span>{isBusy ? "Preparing…" : "Use Template"}</span>
                  {!isBusy && <ArrowRight className="size-3.5 rtl:rotate-180" />}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredTemplates.length === 0 && (
        <div className="py-12 text-center text-sm text-muted-foreground">
          No templates match your search query &ldquo;{search}&rdquo;.
        </div>
      )}

      {/* Template Preview Dialog */}
      <Dialog open={Boolean(previewTemplate)} onOpenChange={(open) => !open && setPreviewTemplate(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          {previewTemplate && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                    {previewTemplate.category}
                  </span>
                  <span className="text-xs text-muted-foreground">· ~{previewTemplate.estimatedMinutes} min setup</span>
                </div>
                <DialogTitle className="text-lg font-bold">{previewTemplate.title}</DialogTitle>
                <DialogDescription>{previewTemplate.description}</DialogDescription>
              </DialogHeader>

              {/* Clauses Scroll Area */}
              <div className="flex-1 overflow-y-auto space-y-4 rounded-2xl border p-4 bg-surface-subtle/50 text-xs">
                <div className="rounded-xl border bg-card p-3 space-y-1">
                  <p className="font-semibold text-foreground">Configured Signer Roles:</p>
                  <ul className="list-disc ps-4 space-y-0.5 text-muted-foreground">
                    {previewTemplate.roles.map((r, i) => (
                      <li key={i}>
                        <strong className="text-foreground">{r.roleName}:</strong> {r.description}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-3">
                  <p className="font-semibold text-foreground">Standard Agreement Clauses:</p>
                  {previewTemplate.draft.sections.map((sec, idx) => (
                    <div key={idx} className="rounded-xl border bg-card p-3 space-y-1">
                      <p className="font-bold text-primary">
                        {idx + 1}. {sec.heading}
                      </p>
                      <p className="text-muted-foreground leading-relaxed">{sec.body}</p>
                    </div>
                  ))}
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0 mt-2">
                <Button type="button" variant="outline" onClick={() => setPreviewTemplate(null)}>
                  Close
                </Button>
                <Button
                  type="button"
                  disabled={Boolean(isInstantiating)}
                  onClick={() => {
                    const t = previewTemplate;
                    setPreviewTemplate(null);
                    void handleUseTemplate(t);
                  }}
                  className="bg-[#a3e635] hover:bg-[#84cc16] text-black font-semibold shadow-xs gap-1.5"
                >
                  <Sparkles className="size-3.5" />
                  <span>Use This Template</span>
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
