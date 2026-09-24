"use client";

import { FolderPlus, Folder as FolderIcon, Loader2, MoreHorizontal, Pencil, Trash2, FolderInput } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFolders, usePlatformToken } from "@/hooks/use-envelope-api";
import {
  ApiError,
  createFolder,
  deleteFolder,
  transferFolderEnvelopes,
  updateFolder,
  type Folder,
} from "@/lib/platform-api";
import { cn } from "@/lib/utils";

export type FolderSelection = "all" | "none" | string;

type Props = {
  selected: FolderSelection;
  onSelect: (value: FolderSelection) => void;
};

type DialogMode = "create" | "rename" | "transfer" | "delete" | null;

export function EnvelopeFolderChips({ selected, onSelect }: Props) {
  const t = useTranslations("Folders");
  const te = useTranslations("Envelopes");
  const foldersQuery = useFolders();
  const folders = foldersQuery.data ?? [];
  const { getAccessToken } = usePlatformToken();
  const queryClient = useQueryClient();

  const activeFolder = useMemo(
    () => (typeof selected === "string" && selected !== "all" && selected !== "none" ? folders.find((folder) => folder.id === selected) ?? null : null),
    [folders, selected],
  );

  const [dialog, setDialog] = useState<DialogMode>(null);
  const [name, setName] = useState("");
  const [transferTarget, setTransferTarget] = useState<string | null>(null);
  const [deleteAfterTransfer, setDeleteAfterTransfer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["folders"] });
    await queryClient.invalidateQueries({ queryKey: ["envelopes"] });
  };

  const openCreate = () => {
    setDialog("create");
    setName("");
    setError(null);
  };

  const openRename = () => {
    if (!activeFolder) {
      return;
    }
    setDialog("rename");
    setName(activeFolder.name);
    setError(null);
  };

  const openTransfer = (andDelete = false) => {
    if (!activeFolder) {
      return;
    }
    setDialog("transfer");
    setTransferTarget(null);
    setDeleteAfterTransfer(andDelete);
    setError(null);
  };

  const openDelete = () => {
    if (!activeFolder) {
      return;
    }
    if (activeFolder.envelopeCount > 0) {
      openTransfer(true);
      return;
    }
    setDialog("delete");
    setError(null);
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error(te("loading"));
      }
      const created = await createFolder(token, { name: name.trim() });
      await refresh();
      setDialog(null);
      setName("");
      onSelect(created.id);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t("createError"));
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeFolder) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error(te("loading"));
      }
      await updateFolder(token, activeFolder.id, { name: name.trim() });
      await refresh();
      setDialog(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t("renameError"));
    } finally {
      setBusy(false);
    }
  };

  const handleTransfer = async () => {
    if (!activeFolder) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error(te("loading"));
      }
      await transferFolderEnvelopes(token, activeFolder.id, transferTarget);
      if (deleteAfterTransfer) {
        await deleteFolder(token, activeFolder.id);
        onSelect(transferTarget ?? "none");
      }
      await refresh();
      setDialog(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t("transferError"));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!activeFolder) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error(te("loading"));
      }
      await deleteFolder(token, activeFolder.id);
      await refresh();
      setDialog(null);
      onSelect("all");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t("deleteError"));
    } finally {
      setBusy(false);
    }
  };

  const chip = (active: boolean) =>
    cn(
      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
      active ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
    );

  const transferDestinations = folders.filter((folder) => folder.id !== activeFolder?.id);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={chip(selected === "all")} onClick={() => onSelect("all")}>
          <FolderIcon className="size-3.5" />
          {t("allEnvelopes")}
        </button>
        <button type="button" className={chip(selected === "none")} onClick={() => onSelect("none")}>
          {t("unfiled")}
        </button>
        {folders.map((folder: Folder) => (
          <button key={folder.id} type="button" className={chip(selected === folder.id)} onClick={() => onSelect(folder.id)}>
            <FolderIcon className="size-3.5" />
            {folder.name}
            <span className={cn("rounded-full px-1.5 py-0.5 text-[10px]", selected === folder.id ? "bg-primary-foreground/20" : "bg-muted")}>
              {folder.envelopeCount}
            </span>
          </button>
        ))}
        <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={openCreate}>
          <FolderPlus className="size-3.5" />
          {t("createFolder")}
        </Button>
        {activeFolder ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="outline" className="rounded-full">
                <MoreHorizontal className="size-3.5" />
                {t("manageFolder")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>{activeFolder.name}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={openRename}>
                <Pencil />
                {t("renameFolder")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openTransfer(false)}>
                <FolderInput />
                {t("transferAll")}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={openDelete}>
                <Trash2 />
                {t("deleteFolder")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      <Dialog open={dialog === "create"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={(event) => void handleCreate(event)}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FolderPlus className="size-5 text-primary" />
                <span>{t("createFolderTitle")}</span>
              </DialogTitle>
              <DialogDescription>{t("createFolderDesc")}</DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="folder-name">{t("folderName")}</Label>
                <Input
                  id="folder-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g., HR, Vendor NDAs, Sales Agreements"
                  autoFocus
                  required
                />
              </div>

              {/* Quick suggestions */}
              <div>
                <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Quick suggestions:</p>
                <div className="flex flex-wrap gap-1.5">
                  {["HR Contracts", "Sales", "Legal & NDAs", "Finance", "Vendor", "Board"].map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => setName(suggestion)}
                      className="rounded-lg border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-surface-subtle hover:text-foreground transition"
                    >
                      + {suggestion}
                    </button>
                  ))}
                </div>
              </div>

              {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
            </div>

            <DialogFooter className="mt-5 gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>
                {t("cancel")}
              </Button>
              <Button
                type="submit"
                disabled={busy || !name.trim()}
                className="bg-[#a3e635] hover:bg-[#84cc16] text-black font-semibold shadow-sm transition"
              >
                {busy ? <Loader2 className="size-4 animate-spin me-1.5" /> : null}
                <span>{t("createSubmit")}</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "rename"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <form onSubmit={(event) => void handleRename(event)}>
            <DialogHeader>
              <DialogTitle>{t("renameTitle")}</DialogTitle>
              <DialogDescription>{t("renameDesc")}</DialogDescription>
            </DialogHeader>
            <div className="mt-4 space-y-2">
              <Label htmlFor="rename-folder">{t("folderName")}</Label>
              <Input id="rename-folder" value={name} onChange={(event) => setName(event.target.value)} autoFocus required />
              {error ? <p className="text-xs text-destructive">{error}</p> : null}
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>
                {t("cancel")}
              </Button>
              <Button
                type="submit"
                disabled={busy || !name.trim()}
                className="bg-[#a3e635] hover:bg-[#84cc16] text-black font-semibold shadow-sm transition"
              >
                {busy ? <Loader2 className="size-4 animate-spin me-1.5" /> : null}
                <span>{t("renameSubmit")}</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "transfer"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{deleteAfterTransfer ? t("deleteWithTransferTitle") : t("transferTitle")}</DialogTitle>
            <DialogDescription>
              {deleteAfterTransfer
                ? t("deleteWithTransferDesc", { name: activeFolder?.name ?? "", count: activeFolder?.envelopeCount ?? 0 })
                : t("transferDesc", { name: activeFolder?.name ?? "", count: activeFolder?.envelopeCount ?? 0 })}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 max-h-72 space-y-1 overflow-auto">
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition",
                transferTarget === null ? "border-primary bg-primary/5" : "hover:bg-muted/60",
              )}
              onClick={() => setTransferTarget(null)}
            >
              <FolderInput className="size-4 text-muted-foreground" />
              <span className="font-medium">{t("unfiled")}</span>
            </button>
            {transferDestinations.map((folder) => (
              <button
                key={folder.id}
                type="button"
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition",
                  transferTarget === folder.id ? "border-primary bg-primary/5" : "hover:bg-muted/60",
                )}
                onClick={() => setTransferTarget(folder.id)}
              >
                <span className="font-medium">{folder.name}</span>
                <span className="text-xs text-muted-foreground">{folder.envelopeCount}</span>
              </button>
            ))}
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialog(null)}>
              {t("cancel")}
            </Button>
            <Button type="button" disabled={busy || !activeFolder} onClick={() => void handleTransfer()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {deleteAfterTransfer ? t("transferAndDelete") : t("transferSubmit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "delete"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>{t("deleteDesc", { name: activeFolder?.name ?? "" })}</DialogDescription>
          </DialogHeader>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialog(null)}>
              {t("cancel")}
            </Button>
            <Button type="button" variant="destructive" disabled={busy} onClick={() => void handleDelete()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("deleteConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
