"use client";

import { Download, ExternalLink, FileUp, Link2, Loader2, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEnvelopeAttachments, usePlatformToken } from "@/hooks/use-envelope-api";
import {
  ApiError,
  createEnvelopeAttachment,
  deleteEnvelopeAttachment,
  envelopeAttachmentPath,
  formatBytes,
  uploadEnvelopeAttachmentFile,
  type EnvelopeAttachment,
} from "@/lib/platform-api";

type Props = {
  envelopeId: string;
  editable: boolean;
};

export function EnvelopeAttachmentsPanel({ envelopeId, editable }: Props) {
  const t = useTranslations("EnvelopeAttachments");
  const queryClient = useQueryClient();
  const { getAccessToken } = usePlatformToken();
  const attachmentsQuery = useEnvelopeAttachments(envelopeId);
  const attachments = attachmentsQuery.data ?? [];
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [fileLabel, setFileLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["envelope-attachments", envelopeId] });
  };

  const handleAddLink = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editable) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error(t("authError"));
      }
      await createEnvelopeAttachment(token, envelopeId, { label: label.trim(), url: url.trim() });
      setLabel("");
      setUrl("");
      await invalidate();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t("saveError"));
    } finally {
      setBusy(false);
    }
  };

  const handleUploadFile = async (file: File) => {
    if (!editable) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error(t("authError"));
      }
      await uploadEnvelopeAttachmentFile(token, envelopeId, fileLabel.trim() || file.name, file);
      setFileLabel("");
      await invalidate();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t("saveError"));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (attachment: EnvelopeAttachment) => {
    if (!editable) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error(t("authError"));
      }
      await deleteEnvelopeAttachment(token, envelopeId, attachment.id);
      await invalidate();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t("saveError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="clay-panel-soft rounded-3xl p-5 sm:p-6">
      <div className="flex items-center gap-2 font-semibold text-foreground">
        <Link2 className="size-4.5 text-primary" />
        <span>{t("title")}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{editable ? t("editableHint") : t("readOnlyHint")}</p>

      {attachmentsQuery.isLoading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("loading")}
        </div>
      ) : attachments.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {attachments.map((attachment) => (
            <li key={attachment.id} className="flex items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{attachment.label}</p>
                {attachment.kind === "file" ? (
                  <a
                    href={envelopeAttachmentPath(envelopeId, attachment.id)}
                    className="mt-0.5 flex items-center gap-1 truncate text-xs text-primary hover:underline"
                  >
                    {attachment.filename}
                    {attachment.sizeBytes ? ` · ${formatBytes(attachment.sizeBytes)}` : null}
                    <Download className="size-3 shrink-0" />
                  </a>
                ) : (
                  <a href={attachment.url} target="_blank" rel="noreferrer" className="mt-0.5 flex items-center gap-1 truncate text-xs text-primary hover:underline">
                    {attachment.url}
                    <ExternalLink className="size-3 shrink-0" />
                  </a>
                )}
              </div>
              {editable ? (
                <Button type="button" size="icon" variant="ghost" className="shrink-0 text-destructive" disabled={busy} onClick={() => void handleDelete(attachment)}>
                  <Trash2 className="size-4" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {editable ? (
        <div className="mt-4 space-y-4 border-t pt-4">
          <form className="space-y-3" onSubmit={(event) => void handleAddLink(event)}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("addLinkSection")}</p>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{t("label")}</Label>
              <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder={t("labelPlaceholder")} required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{t("url")}</Label>
              <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder={t("urlPlaceholder")} type="url" required />
            </div>
            <Button type="submit" size="sm" variant="outline" disabled={busy || !label.trim() || !url.trim()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {t("addLink")}
            </Button>
          </form>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("uploadFileSection")}</p>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{t("label")}</Label>
              <Input value={fileLabel} onChange={(event) => setFileLabel(event.target.value)} placeholder={t("fileLabelPlaceholder")} />
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.doc,.docx"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) {
                  void handleUploadFile(file);
                }
              }}
            />
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => fileInputRef.current?.click()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
              {t("uploadFile")}
            </Button>
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
