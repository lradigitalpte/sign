"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  FileCheck2,
  FilePenLine,
  FileText,
  HelpCircle,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePlatformToken } from "@/hooks/use-envelope-api";
import { createContractPdfFile, type ContractDraft, type DocumentSection } from "@/lib/pdf-builder";
import { createEnvelope, uploadEnvelopeDocument } from "@/lib/platform-api";

const PRESET_CLAUSES: { label: string; heading: string; body: string }[] = [
  {
    label: "+ Scope & Deliverables",
    heading: "Scope of Work & Deliverables",
    body: "The provider shall deliver the agreed services and technical specifications described herein with professional standard of care and in accordance with established milestones.",
  },
  {
    label: "+ Payment Terms",
    heading: "Compensation & Payment Terms",
    body: "Client agrees to remit payments in accordance with approved milestone invoices net thirty (30) days following receipt. Late payments shall accrue interest at 1.5% per month.",
  },
  {
    label: "+ Confidentiality",
    heading: "Confidentiality & Non-Disclosure",
    body: "Each party agrees to hold in strict confidence all proprietary data, financial records, software architectures, and trade secrets disclosed in connection with this Agreement.",
  },
  {
    label: "+ Intellectual Property",
    heading: "Intellectual Property Ownership",
    body: "All deliverables, software code, custom designs, and documentation generated hereunder shall constitute work-made-for-hire and become the exclusive property of the Client upon final payment.",
  },
  {
    label: "+ Term & Termination",
    heading: "Term & Termination",
    body: "Either party may terminate this Agreement upon thirty (30) days written notice, or immediately upon material breach remaining uncured after fifteen (15) days written notification.",
  },
  {
    label: "+ Governing Law",
    heading: "Governing Law & Jurisdiction",
    body: "This Agreement shall be governed and interpreted under the laws of Delaware, and the parties submit to the exclusive jurisdiction of the state and federal courts located therein.",
  },
];

type Props = {
  onSuccessRedirect?: (envelopeId: string) => void;
};

export function ScratchDocumentBuilder({ onSuccessRedirect }: Props) {
  const router = useRouter();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const { getAccessToken } = usePlatformToken();

  const [title, setTitle] = useState("Commercial Services Agreement");
  const [subtitle, setSubtitle] = useState("Master Services Terms & Scope");
  const [effectiveDate, setEffectiveDate] = useState(
    new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
  );

  const [partyAName, setPartyAName] = useState("Enterprise Corp");
  const [partyACompany, setPartyACompany] = useState("First Party (Provider)");
  const [partyAEmail, setPartyAEmail] = useState("contact@enterprise.com");

  const [partyBName, setPartyBName] = useState("Client Partner LLC");
  const [partyBCompany, setPartyBCompany] = useState("Second Party (Client)");
  const [partyBEmail, setPartyBEmail] = useState("representative@clientpartner.com");

  const [sections, setSections] = useState<DocumentSection[]>([
    {
      heading: "Purpose & Engagement",
      body: "This Agreement sets forth the terms and conditions under which the First Party agrees to provide specialized services, advisory, and deliverables to the Second Party.",
    },
    {
      heading: "Performance & Standard of Care",
      body: "All services rendered shall be executed in a professional, workmanlike manner adhering to modern industry standards and compliance protocols.",
    },
    {
      heading: "Confidentiality & Non-Disclosure",
      body: "The parties shall maintain strict confidentiality over all exchanged business secrets, technical architectures, and financial data for a minimum term of two (2) years.",
    },
  ]);

  const [isCompiling, setIsCompiling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addClause = (heading: string, body: string) => {
    setSections((prev) => [...prev, { heading, body }]);
  };

  const removeSection = (index: number) => {
    setSections((prev) => prev.filter((_, i) => i !== index));
  };

  const updateSection = (index: number, field: "heading" | "body", value: string) => {
    setSections((prev) =>
      prev.map((sec, i) => (i === index ? { ...sec, [field]: value } : sec)),
    );
  };

  const handleCompileAndProceed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || sections.length === 0) {
      setError("Please provide a document title and at least one contract section.");
      return;
    }

    setIsCompiling(true);
    setError(null);

    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Authentication required.");

      const draft: ContractDraft = {
        title: title.trim(),
        subtitle: subtitle.trim(),
        effectiveDate: effectiveDate.trim(),
        partyA: {
          name: partyAName.trim(),
          company: partyACompany.trim(),
          email: partyAEmail.trim(),
        },
        partyB: {
          name: partyBName.trim(),
          company: partyBCompany.trim(),
          email: partyBEmail.trim(),
        },
        sections: sections.map((s) => ({
          heading: s.heading?.trim(),
          body: s.body.trim(),
        })),
        footerNote: "Standard Vector PDF Generation · Signing Workspace Legal Integrity",
      };

      // 1. Generate standard PDF file
      const pdfFile = createContractPdfFile(draft);

      // 2. Create Envelope
      const created = await createEnvelope(token, {
        title: draft.title,
        language: locale,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });

      // 3. Upload Document to Envelope
      await uploadEnvelopeDocument(token, created.id, pdfFile);

      await queryClient.invalidateQueries({ queryKey: ["envelopes"] });

      if (onSuccessRedirect) {
        onSuccessRedirect(created.id);
      } else {
        router.push(`/envelopes/${created.id}/recipients`);
      }
    } catch (caught: any) {
      setError(caught?.message || "Failed to compile agreement.");
      setIsCompiling(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleCompileAndProceed(e)} className="space-y-8">
      {/* Header Info */}
      <div className="clay-panel-soft rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <FilePenLine className="size-5 text-primary" />
          <h3 className="text-base font-bold text-foreground">Agreement Overview</h3>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="scratch-title">Agreement Title *</Label>
            <Input
              id="scratch-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Master Services Agreement"
              className="h-10 rounded-xl font-medium"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="scratch-subtitle">Subtitle / Category</Label>
            <Input
              id="scratch-subtitle"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="e.g. Standard Commercial Terms"
              className="h-9 rounded-xl text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="scratch-date">Effective Date</Label>
            <Input
              id="scratch-date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              className="h-9 rounded-xl text-xs"
            />
          </div>
        </div>
      </div>

      {/* Parties Block */}
      <div className="clay-panel-soft rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Users className="size-5 text-primary" />
          <h3 className="text-base font-bold text-foreground">Parties Involved</h3>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Party A */}
          <div className="rounded-2xl border p-4 space-y-3 bg-card/70">
            <p className="text-xs font-bold text-primary uppercase tracking-wider">Party A (First Party / Discloser)</p>
            <div className="space-y-2">
              <Input
                value={partyAName}
                onChange={(e) => setPartyAName(e.target.value)}
                placeholder="Full Name / Authorized Signatory"
                className="h-8 text-xs"
              />
              <Input
                value={partyACompany}
                onChange={(e) => setPartyACompany(e.target.value)}
                placeholder="Company / Entity Name"
                className="h-8 text-xs"
              />
              <Input
                value={partyAEmail}
                onChange={(e) => setPartyAEmail(e.target.value)}
                placeholder="Email Address"
                className="h-8 text-xs"
              />
            </div>
          </div>

          {/* Party B */}
          <div className="rounded-2xl border p-4 space-y-3 bg-card/70">
            <p className="text-xs font-bold text-primary uppercase tracking-wider">Party B (Second Party / Recipient)</p>
            <div className="space-y-2">
              <Input
                value={partyBName}
                onChange={(e) => setPartyBName(e.target.value)}
                placeholder="Full Name / Authorized Signatory"
                className="h-8 text-xs"
              />
              <Input
                value={partyBCompany}
                onChange={(e) => setPartyBCompany(e.target.value)}
                placeholder="Company / Entity Name"
                className="h-8 text-xs"
              />
              <Input
                value={partyBEmail}
                onChange={(e) => setPartyBEmail(e.target.value)}
                placeholder="Email Address"
                className="h-8 text-xs"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Sections & Clauses */}
      <div className="clay-panel-soft rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileText className="size-5 text-primary" />
            <h3 className="text-base font-bold text-foreground">Document Clauses & Terms ({sections.length})</h3>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addClause("New Clause", "Enter clause details here…")}
            className="gap-1.5 text-xs rounded-xl self-start sm:self-auto"
          >
            <Plus className="size-3.5" />
            Add Custom Section
          </Button>
        </div>

        {/* Quick Clause Suggestions */}
        <div className="rounded-2xl border p-3 bg-surface-subtle/60">
          <p className="text-[11px] font-semibold text-muted-foreground mb-2">
            Click to add standard clauses:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PRESET_CLAUSES.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => addClause(preset.heading, preset.body)}
                className="rounded-lg border bg-background/80 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground transition"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Clause List */}
        <div className="space-y-4">
          {sections.map((sec, idx) => (
            <div key={idx} className="rounded-2xl border bg-card p-4 space-y-3 relative group">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1">
                  <span className="size-6 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                    {idx + 1}
                  </span>
                  <Input
                    value={sec.heading ?? ""}
                    onChange={(e) => updateSection(idx, "heading", e.target.value)}
                    placeholder="Clause Title (e.g. Scope of Work)"
                    className="h-8 font-semibold text-xs rounded-lg"
                  />
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => removeSection(idx)}
                  className="size-8 text-muted-foreground hover:text-destructive shrink-0"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>

              <Textarea
                value={sec.body}
                onChange={(e) => updateSection(idx, "body", e.target.value)}
                placeholder="Clause text and legal provisions…"
                rows={3}
                className="text-xs rounded-lg resize-y bg-surface-subtle/30"
              />
            </div>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          {error}
        </div>
      ) : null}

      {/* Submit Button */}
      <div className="clay-panel-soft flex flex-col sm:flex-row items-center justify-between gap-3 rounded-3xl p-5">
        <p className="text-xs text-muted-foreground">
          ✨ The platform will compile a crisp vector PDF and transition directly to signer & signature field placement.
        </p>
        <Button
          type="submit"
          size="lg"
          disabled={isCompiling || sections.length === 0}
          className="w-full sm:w-auto bg-[#a3e635] hover:bg-[#84cc16] text-black font-semibold rounded-xl text-sm gap-2 shadow-sm shrink-0"
        >
          {isCompiling ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          <span>{isCompiling ? "Compiling Document…" : "Generate PDF & Continue"}</span>
          {!isCompiling && <ArrowRight className="size-4 rtl:rotate-180" />}
        </Button>
      </div>
    </form>
  );
}
