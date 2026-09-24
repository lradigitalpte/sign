"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  Download,
  ExternalLink,
  FileText,
  Globe,
  Loader2,
  Paperclip,
  Plus,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useRef, useState } from "react";

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
import { Label } from "@/components/ui/label";
import { useEnvelopeAttachments, usePlatformToken } from "@/hooks/use-envelope-api";
import {
  ApiError,
  createEnvelopeAttachment,
  deleteEnvelopeAttachment,
  formatBytes,
  platformApiUrl,
  uploadEnvelopeAttachmentFile,
  type EnvelopeAttachment,
} from "@/lib/platform-api";
import { cn } from "@/lib/utils";

type Props = {
  envelopeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AttachmentsDialog({ envelopeId, open, onOpenChange }: Props) {
  const { getAccessToken } = usePlatformToken();
  const queryClient = useQueryClient();
  const attachmentsQuery = useEnvelopeAttachments(envelopeId);
  const attachments = attachmentsQuery.data ?? [];
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isAddingLink, setIsAddingLink] = useState(false);
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);

    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Authentication required.");

      const label = file.name.replace(/\.[^/.]+$/, "");
      await uploadEnvelopeAttachmentFile(token, envelopeId, label, file);
      await queryClient.invalidateQueries({ queryKey: ["envelope-attachments", envelopeId] });
    } catch (caught: any) {
      setError(caught?.message || "Failed to upload attachment file.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAddLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkTitle.trim() || !linkUrl.trim()) return;

    setIsUploading(true);
    setError(null);

    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Authentication required.");

      await createEnvelopeAttachment(token, envelopeId, {
        label: linkTitle.trim(),
        url: linkUrl.trim(),
      });

      await queryClient.invalidateQueries({ queryKey: ["envelope-attachments", envelopeId] });
      setIsAddingLink(false);
      setLinkTitle("");
      setLinkUrl("");
    } catch (caught: any) {
      setError(caught?.message || "Failed to add link attachment.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    try {
      const token = await getAccessToken();
      if (!token) return;

      await deleteEnvelopeAttachment(token, envelopeId, attachmentId);
      await queryClient.invalidateQueries({ queryKey: ["envelope-attachments", envelopeId] });
    } catch (caught: any) {
      setError(caught?.message || "Failed to delete attachment.");
    }
  };

  const handleDownload = async (att: EnvelopeAttachment) => {
    try {
      const token = await getAccessToken();
      if (!token) return;

      const res = await fetch(`${platformApiUrl}/v1/envelopes/${envelopeId}/attachments/${att.id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = att.filename || "attachment";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Failed to download attachment file.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl w-full sm:w-[680px] rounded-3xl p-6 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Paperclip className="size-5 text-primary" />
            <span>Document Attachments</span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            Attach supporting documents, exhibits, or reference links that signers can view and download.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.txt"
          className="hidden"
          onChange={(e) => void handleFileUpload(e)}
        />

        {/* Action Toolbar */}
        <div className="flex items-center gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 gap-1.5 text-xs rounded-xl h-9"
          >
            {isUploading ? <Loader2 className="size-3.5 animate-spin" /> : <UploadCloud className="size-3.5" />}
            <span>Upload File</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isUploading}
            onClick={() => setIsAddingLink((v) => !v)}
            className="flex-1 gap-1.5 text-xs rounded-xl h-9"
          >
            <Globe className="size-3.5" />
            <span>Add Web Link</span>
          </Button>
        </div>

        {/* Inline Add Link Form */}
        {isAddingLink && (
          <form
            onSubmit={(e) => void handleAddLink(e)}
            className="rounded-2xl border p-3 bg-surface-subtle/70 space-y-2.5 animate-in fade-in"
          >
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Attachment Label *</Label>
              <Input
                value={linkTitle}
                onChange={(e) => setLinkTitle(e.target.value)}
                placeholder="e.g. Terms of Service Reference"
                className="h-8 text-xs bg-background"
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Destination URL *</Label>
              <Input
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://company.com/terms"
                className="h-8 text-xs bg-background"
                required
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setIsAddingLink(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isUploading || !linkTitle.trim() || !linkUrl.trim()} className="h-7 text-xs bg-[#a3e635] hover:bg-[#84cc16] text-black font-semibold">
                {isUploading ? <Loader2 className="size-3 animate-spin" /> : "Save Link"}
              </Button>
            </div>
          </form>
        )}

        {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}

        {/* Attachments List */}
        <div className="space-y-2 max-h-60 overflow-y-auto rounded-2xl border p-2 bg-surface-subtle/40">
          {attachments.map((att: EnvelopeAttachment) => (
            <div
              key={att.id}
              className="flex items-center justify-between gap-3 rounded-xl border bg-card p-2.5 shadow-xs transition hover:shadow-sm"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary shrink-0">
                  {att.kind === "file" ? <FileText className="size-4" /> : <Globe className="size-4" />}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-foreground">{att.label}</p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {att.kind === "file"
                      ? `${att.filename ?? "File"} · ${formatBytes(att.sizeBytes ?? 0)}`
                      : att.url}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {att.kind === "file" ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => void handleDownload(att)}
                    className="size-7 text-muted-foreground hover:text-foreground"
                    title="Download File"
                  >
                    <Download className="size-3.5" />
                  </Button>
                ) : (
                  <a
                    href={att.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Open Link"
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                )}
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => void handleDeleteAttachment(att.id)}
                  className="size-7 text-muted-foreground hover:text-destructive"
                  title="Remove Attachment"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}

          {attachments.length === 0 && !isAddingLink && (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No attachments added yet. Upload supporting files or add external links.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
