"use client";

import { Check, Folder, FolderInput, FolderPlus, Loader2, Plus, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

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
import { useFolders, usePlatformToken } from "@/hooks/use-envelope-api";
import {
  ApiError,
  bulkMoveEnvelopesToFolder,
  createFolder,
  moveEnvelopeToFolder,
  type Envelope,
  type Folder as FolderType,
} from "@/lib/platform-api";
import { cn } from "@/lib/utils";

type Props = {
  envelope?: Envelope | null;
  envelopes?: Envelope[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

export function MoveToFolderDialog({ envelope, envelopes, open, onOpenChange, onSuccess }: Props) {
  const t = useTranslations("Folders");
  const foldersQuery = useFolders();
  const folders = foldersQuery.data ?? [];
  const { getAccessToken } = usePlatformToken();
  const queryClient = useQueryClient();

  const targetEnvelopes = useMemo(
    () => (envelopes && envelopes.length > 0 ? envelopes : envelope ? [envelope] : []),
    [envelope, envelopes],
  );

  const [selected, setSelected] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreatingInline, setIsCreatingInline] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreatingBusy, setIsCreatingBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSelected(targetEnvelopes[0]?.folderId ?? null);
      setSearchQuery("");
      setIsCreatingInline(false);
      setNewFolderName("");
      setError(null);
    }
  }, [open, targetEnvelopes]);

  const filteredFolders = useMemo(() => {
    if (!searchQuery.trim()) return folders;
    return folders.filter((f) => f.name.toLowerCase().includes(searchQuery.trim().toLowerCase()));
  }, [folders, searchQuery]);

  const handleCreateNewFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFolderName.trim();
    if (!trimmed) return;

    setIsCreatingBusy(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Authentication required");
      const created = await createFolder(token, { name: trimmed });
      await queryClient.invalidateQueries({ queryKey: ["folders"] });
      setSelected(created.id);
      setIsCreatingInline(false);
      setNewFolderName("");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t("createError"));
    } finally {
      setIsCreatingBusy(false);
    }
  };

  const handleMove = async () => {
    if (targetEnvelopes.length === 0) return;

    setBusy(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error(t("moveError"));
      }

      if (targetEnvelopes.length === 1) {
        await moveEnvelopeToFolder(token, targetEnvelopes[0].id, selected);
      } else {
        await bulkMoveEnvelopesToFolder(
          token,
          targetEnvelopes.map((e) => e.id),
          selected,
        );
      }

      await queryClient.invalidateQueries({ queryKey: ["envelopes"] });
      await queryClient.invalidateQueries({ queryKey: ["folders"] });
      onSuccess?.();
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t("moveError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderInput className="size-5 text-primary" />
            <span>{t("moveTitle")}</span>
          </DialogTitle>
          <DialogDescription>
            {targetEnvelopes.length > 1
              ? `Select destination folder for ${targetEnvelopes.length} selected agreements.`
              : t("moveDesc", { title: targetEnvelopes[0]?.title ?? "" })}
          </DialogDescription>
        </DialogHeader>

        {/* Quick Search & Create Header */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Find or filter folders…"
                className="h-8 ps-8 pe-3 text-xs"
              />
            </div>
            {!isCreatingInline && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs shrink-0"
                onClick={() => setIsCreatingInline(true)}
              >
                <Plus className="size-3.5" />
                <span>New folder</span>
              </Button>
            )}
          </div>

          {/* Inline Create Folder Form */}
          {isCreatingInline && (
            <form
              onSubmit={(e) => void handleCreateNewFolder(e)}
              className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-2 animate-in fade-in zoom-in-95 duration-150"
            >
              <FolderPlus className="size-4 shrink-0 text-primary ms-1" />
              <Input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Folder name (e.g., HR, Sales)…"
                className="h-7 text-xs bg-background"
                disabled={isCreatingBusy}
              />
              <Button
                type="submit"
                size="sm"
                className="h-7 px-3 text-xs font-semibold"
                disabled={isCreatingBusy || !newFolderName.trim()}
              >
                {isCreatingBusy ? <Loader2 className="size-3 animate-spin" /> : "Create"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => {
                  setIsCreatingInline(false);
                  setNewFolderName("");
                }}
              >
                <X className="size-3.5" />
              </Button>
            </form>
          )}
        </div>

        {/* Folder List */}
        <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-xl border p-1.5 bg-surface-subtle/50">
          {/* Unfiled Option */}
          <button
            type="button"
            className={cn(
              "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition",
              selected === null
                ? "border-primary bg-primary/10 text-foreground font-semibold shadow-sm ring-1 ring-primary"
                : "border-transparent bg-background/80 hover:bg-muted/70 text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setSelected(null)}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <FolderInput className={cn("size-4 shrink-0", selected === null ? "text-primary" : "text-muted-foreground")} />
              <span className="truncate">{t("unfiled")}</span>
            </div>
            {selected === null && <Check className="size-4 text-primary shrink-0" />}
          </button>

          {/* User Folders */}
          {filteredFolders.map((f: FolderType) => {
            const isSelected = selected === f.id;
            return (
              <button
                key={f.id}
                type="button"
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition",
                  isSelected
                    ? "border-primary bg-primary/10 text-foreground font-semibold shadow-sm ring-1 ring-primary"
                    : "border-transparent bg-background/80 hover:bg-muted/70 text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setSelected(f.id)}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Folder className={cn("size-4 shrink-0", isSelected ? "text-primary" : "text-muted-foreground")} />
                  <span className="truncate">{f.name}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="rounded-full bg-muted/80 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    {f.envelopeCount} {f.envelopeCount === 1 ? "item" : "items"}
                  </span>
                  {isSelected && <Check className="size-4 text-primary" />}
                </div>
              </button>
            );
          })}

          {filteredFolders.length === 0 && searchQuery.trim() && (
            <div className="py-4 text-center text-xs text-muted-foreground">
              No folders match &ldquo;{searchQuery}&rdquo;
            </div>
          )}

          {folders.length === 0 && !searchQuery.trim() && (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              {t("emptyFolders")}
            </p>
          )}
        </div>

        {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            disabled={busy || targetEnvelopes.length === 0}
            onClick={() => void handleMove()}
            className="bg-[#a3e635] hover:bg-[#84cc16] text-black font-semibold shadow-sm transition"
          >
            {busy ? <Loader2 className="size-4 animate-spin me-1.5" /> : null}
            <span>{t("moveSubmit")}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
