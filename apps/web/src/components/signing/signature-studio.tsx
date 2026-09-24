"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Download, ImageUp, Loader2, PenLine, Redo2, Save, Trash2, Type, Undo2 } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { ImageUploadDropzone } from "@/components/shared/document-dropzone";
import { SignatureFontPicker } from "@/components/signing/signature-font-picker";
import { AnimatedInkSwatch, DrawSignatureCanvas, TypedSignaturePreview } from "@/components/signing/signature-studio-panels";
import { SignaturePad, type SignaturePadHandle } from "@/components/shared/signature-pad";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { usePlatformToken } from "@/hooks/use-envelope-api";
import { signatureFontById } from "@/lib/signature-fonts";
import {
  appearanceToPng,
  CHECKERBOARD_CLASS,
  downloadPng,
  fileSafeName,
  renderTypedSignaturePng,
  SIGNATURE_INK_COLORS,
  signatureInkById,
  trimTransparentCanvas,
} from "@/lib/signature-maker";
import { updateSignaturePreferences, type SignatureAppearance, type SignaturePreferences } from "@/lib/platform-api";
import { cn } from "@/lib/utils";

function libraryItems(initial?: SignatureAppearance) {
  if (initial?.items?.length) {
    return initial.items;
  }
  if (initial?.text || initial?.image) {
    return [{ ...initial, id: initial.id ?? "legacy", name: initial.name ?? "Saved signature" }];
  }
  return [];
}

export function SignatureStudio({ initial, defaultName }: { initial: SignaturePreferences; defaultName: string }) {
  const { getAccessToken } = usePlatformToken();
  const queryClient = useQueryClient();
  const pad = useRef<SignaturePadHandle | null>(null);
  const initialsPad = useRef<SignaturePadHandle | null>(null);
  const [items, setItems] = useState<SignatureAppearance[]>(libraryItems(initial.signature));
  const [selectedId, setSelectedId] = useState(initial.signature?.id ?? libraryItems(initial.signature)[0]?.id ?? "");
  const [initialItems, setInitialItems] = useState<SignatureAppearance[]>(libraryItems(initial.initials));
  const [selectedInitialId, setSelectedInitialId] = useState(initial.initials?.id ?? libraryItems(initial.initials)[0]?.id ?? "");
  const [target, setTarget] = useState<"signature" | "initials">("signature");
  const [mode, setMode] = useState<"draw" | "upload" | "type">("type");
  const [label, setLabel] = useState("My signature");
  const [text, setText] = useState(defaultName);
  const [fontId, setFontId] = useState(initial.signature?.font ?? "dancing");
  const [inkId, setInkId] = useState<"black" | "blue">(initial.signature?.color === "#1d4ed8" ? "blue" : "black");
  const [drawn, setDrawn] = useState(false);
  const [initialsDrawn, setInitialsDrawn] = useState(false);
  const [padHistory, setPadHistory] = useState({ canUndo: false, canRedo: false });
  const [initialsHistory, setInitialsHistory] = useState({ canUndo: false, canRedo: false });
  const [initials, setInitials] = useState<SignatureAppearance>(
    initial.initials ?? {
      id: crypto.randomUUID(),
      name: "Initials",
      text: defaultName
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join(""),
      source: "type",
    },
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [downloadTarget, setDownloadTarget] = useState<SignatureAppearance | null>(null);
  const [downloadName, setDownloadName] = useState("");
  const ink = signatureInkById(inkId);

  const addAppearance = (appearance: Omit<SignatureAppearance, "id">) => {
    const value = { ...appearance, id: crypto.randomUUID(), name: target === "initials" ? `Initials ${initialItems.length + 1}` : label.trim() || "Signature", font: fontId, color: ink.value };
    const currentLibrary = target === "signature" ? items : initialItems;
    if (currentLibrary.length >= 12) { setNotice(`You can save up to 12 ${target === "signature" ? "signatures" : "initial variants"}.`); return; }
    const duplicate = currentLibrary.some((item) => item.image === value.image && item.text === value.text);
    if (duplicate) { setNotice(`That ${target} is already saved.`); return; }
    if (target === "signature") { setItems((current) => [...current, value]); setSelectedId(value.id); }
    else { setInitialItems((current) => [...current, value]); setSelectedInitialId(value.id); setInitials(value); }
    setNotice(`${target === "signature" ? "Signature" : "Initials"} added. Save to keep it on your account.`);
  };

  const addDrawing = () => {
    const image = pad.current?.toDataURL();
    if (image) {
      addAppearance({ text: text.trim() || defaultName, image, source: "draw" });
      pad.current?.clear();
      setDrawn(false);
    }
  };

  const addTyped = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const image = await renderTypedSignaturePng({ text: text.trim() || defaultName, fontId, color: ink.value });
      addAppearance({ text: text.trim() || defaultName, image, source: "type", font: fontId, color: ink.value });
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Unable to create typed signature.");
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!/image\/(png|jpeg)/.test(file.type) || file.size > 3 * 1024 * 1024) {
      setNotice("Upload a PNG or JPG no larger than 3 MB.");
      return;
    }
    try {
      const image = await normalizeImage(file);
      addAppearance({ text: target === "initials" ? initials.text.trim() : text.trim() || defaultName, image, source: "upload" });
    } catch {
      setNotice("That image could not be processed.");
    }
  };

  const saveInitialsTyped = async () => {
    setBusy(true);
    try {
      const image = await renderTypedSignaturePng({ text: initials.text.trim(), fontId, color: ink.value, fontSize: 64 });
      addAppearance({ text: initials.text.trim(), image, source: "type", font: fontId, color: ink.value });
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Unable to create initials.");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const selected = items.find((item) => item.id === selectedId) ?? items[0];
    if (!selected) {
      setNotice("Add at least one signature first.");
      return;
    }
    const selectedInitials = initialItems.find((item) => item.id === selectedInitialId) ?? initialItems[0] ?? initials;
    if (!selectedInitials?.text.trim()) {
      setNotice("Add initials before saving.");
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      const initialsImage = selectedInitials.image || (await renderTypedSignaturePng({ text: selectedInitials.text.trim(), fontId: selectedInitials.font ?? fontId, color: selectedInitials.color ?? ink.value, fontSize: 64 }));
      await updateSignaturePreferences(token, {
        signature: { ...selected, items },
        initials: { ...selectedInitials, image: initialsImage, id: selectedInitials.id ?? crypto.randomUUID(), name: selectedInitials.name ?? "Initials", items: initialItems.length ? initialItems : [selectedInitials] },
      });
      window.localStorage.setItem("yoursign.saved-signature", JSON.stringify({ ...selected, items }));
      window.localStorage.setItem("yoursign.saved-initials", JSON.stringify({ ...selectedInitials, image: initialsImage, items: initialItems.length ? initialItems : [selectedInitials] }));
      await queryClient.invalidateQueries({ queryKey: ["signature-preferences"] });
      setNotice("Signature library saved to your account.");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Unable to save signature library.");
    } finally {
      setBusy(false);
    }
  };

  const downloadSelected = async (appearance: SignatureAppearance) => {
    try {
      const png = await appearanceToPng({ ...appearance, font: appearance.font ?? fontId, color: appearance.color ?? ink.value });
      downloadPng(png, fileSafeName(appearance.name || appearance.text || "signature"));
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Unable to download PNG.");
    }
  };

  const openDownload = (appearance: SignatureAppearance) => {
    setDownloadTarget(appearance);
    setDownloadName(fileSafeName(appearance.name || appearance.text || "signature"));
  };

  return (
    <section className="overflow-hidden rounded-3xl border bg-background shadow-sm">
      <div className="border-b p-6">
        <h2 className="text-xl font-semibold">Signature maker</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Draw, type in a script font, or upload. Download a transparent PNG to keep for yourself.
        </p>
      </div>
      <div className="grid xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="p-5 sm:p-6 lg:p-8 xl:p-10">
          <div className="flex gap-1 rounded-2xl bg-surface-subtle p-1">
            {(["signature", "initials"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setTarget(value)}
                className={cn("flex-1 rounded-xl px-3 py-2 text-sm font-semibold capitalize", target === value ? "bg-background shadow-sm" : "text-muted-foreground")}
              >
                {value}
              </button>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-surface-subtle p-1.5">
            {([{ key: "type", icon: Type, text: "Type" }, { key: "draw", icon: PenLine, text: "Draw" }, { key: "upload", icon: ImageUp, text: "Upload" }] as const).map(
              ({ key, icon: Icon, text: title }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMode(key)}
                  className={cn("flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold", mode === key ? "bg-background text-primary shadow-sm" : "text-muted-foreground")}
                >
                  <Icon className="size-4" />
                  {title}
                </button>
              ),
            )}
          </div>

          {target === "signature" ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-semibold">Label</label>
                <Input className="mt-2" value={label} onChange={(event) => setLabel(event.target.value)} />
              </div>
              <div>
                <label className="text-sm font-semibold">Name</label>
                <Input className="mt-2" value={text} onChange={(event) => setText(event.target.value)} />
              </div>
            </div>
          ) : (
            <div className="mt-5">
              <label className="text-sm font-semibold">Initials</label>
              <Input
                className="mt-2 max-w-48 text-lg font-semibold"
                value={initials.text}
                onChange={(event) => setInitials((current) => ({ ...current, text: event.target.value }))}
              />
            </div>
          )}

          {(mode === "type" || mode === "draw") && (
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <div className="flex gap-2">
                {SIGNATURE_INK_COLORS.map((item) => (
                  <AnimatedInkSwatch
                    key={item.id}
                    active={inkId === item.id}
                    color={item.value}
                    label={item.label}
                    onClick={() => setInkId(item.id)}
                  />
                ))}
              </div>
              {mode === "type" ? <SignatureFontPicker value={fontId} onChange={setFontId} /> : null}
            </div>
          )}

          <AnimatePresence mode="wait">
            {target === "signature" && mode === "type" ? (
              <motion.div
                key="signature-type"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mt-5"
              >
                <TypedSignaturePreview
                  fontId={fontId}
                  ink={ink.value}
                  placeholder={defaultName}
                  text={text}
                />
                <p className="mt-2 text-xs text-muted-foreground">Checkerboard is only the preview — the PNG has no background.</p>
                <Button className="mt-4" disabled={busy || !(text || defaultName).trim()} onClick={() => void addTyped()}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                  Add typed signature
                </Button>
              </motion.div>
            ) : null}

            {target === "signature" && mode === "draw" ? (
              <motion.div
                key="signature-draw"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mt-5"
              >
                <DrawSignatureCanvas empty={!drawn} hint="Draw your signature here">
                  <SignaturePad handleRef={pad} color={ink.value} onEmptyChange={(empty) => setDrawn(!empty)} onHistoryChange={setPadHistory} className="relative z-20 h-64 w-full cursor-crosshair bg-transparent" />
                </DrawSignatureCanvas>
                <div className="mt-3 flex gap-2">
                  <Button variant="outline" size="icon" aria-label="Undo" disabled={!padHistory.canUndo} onClick={() => pad.current?.undo()}><Undo2 /></Button>
                  <Button variant="outline" size="icon" aria-label="Redo" disabled={!padHistory.canRedo} onClick={() => pad.current?.redo()}><Redo2 /></Button>
                  <Button variant="outline" onClick={() => { pad.current?.clear(); setDrawn(false); }}>
                    Clear
                  </Button>
                  <Button disabled={!drawn} onClick={addDrawing}>
                    Add drawn signature
                  </Button>
                </div>
              </motion.div>
            ) : null}

            {mode === "upload" ? (
              <motion.div
                key={`${target}-upload`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mt-5"
              >
                <ImageUploadDropzone
                  className="min-h-64"
                  disabled={busy}
                  label={`Upload ${target} image`}
                  description="Transparent PNG preferred, or JPG up to 3 MB. White space is removed automatically."
                  onFile={(file) => void upload(file)}
                />
              </motion.div>
            ) : null}

            {target === "initials" && mode === "type" ? (
              <motion.div
                key="initials-type"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mt-5"
              >
                <TypedSignaturePreview
                  fontId={fontId}
                  ink={ink.value}
                  placeholder="AA"
                  size="initials"
                  text={initials.text}
                />
                <Button className="mt-4" disabled={busy || !initials.text.trim()} onClick={() => void saveInitialsTyped()}>
                  Use these initials
                </Button>
              </motion.div>
            ) : null}

            {target === "initials" && mode === "draw" ? (
              <motion.div
                key="initials-draw"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mt-5"
              >
                <DrawSignatureCanvas empty={!initialsDrawn} hint="Draw your initials here" tall={false}>
                  <SignaturePad handleRef={initialsPad} color={ink.value} onEmptyChange={(empty) => setInitialsDrawn(!empty)} onHistoryChange={setInitialsHistory} className="relative z-20 h-40 w-full bg-transparent" />
                </DrawSignatureCanvas>
                <div className="mt-3 flex gap-2">
                  <Button variant="outline" size="icon" aria-label="Undo" disabled={!initialsHistory.canUndo} onClick={() => initialsPad.current?.undo()}><Undo2 /></Button>
                  <Button variant="outline" size="icon" aria-label="Redo" disabled={!initialsHistory.canRedo} onClick={() => initialsPad.current?.redo()}><Redo2 /></Button>
                  <Button variant="outline" onClick={() => { initialsPad.current?.clear(); setInitialsDrawn(false); }}>
                    Clear
                  </Button>
                  <Button
                    disabled={!initialsDrawn}
                    onClick={() => {
                      const image = initialsPad.current?.toDataURL();
                      if (!image) return;
                      addAppearance({ text: initials.text.trim(), image, source: "draw", color: ink.value });
                      initialsPad.current?.clear();
                      setInitialsDrawn(false);
                      setNotice("Initials updated. Save to keep them on your account.");
                    }}
                  >
                    Use drawing
                  </Button>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

        </div>

        <aside className="border-t bg-surface-subtle p-5 sm:p-6 xl:border-s xl:border-t-0 xl:p-7">
          <h3 className="font-semibold">Saved signatures</h3>
          <p className="mt-1 text-xs text-muted-foreground">Default is used when you sign. Download a transparent PNG anytime.</p>
          <div className="mt-4 space-y-3">
            {items.length === 0 ? (
              <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">No saved signatures yet.</p>
            ) : (
              items.map((item) => (
                <div key={item.id} className={cn("relative rounded-2xl border bg-background p-3", selectedId === item.id && "border-primary ring-2 ring-primary/20")}>
                  <button type="button" className="w-full text-start" onClick={() => setSelectedId(item.id ?? "")}>
                    <div className={cn("flex h-20 items-center justify-center overflow-hidden rounded-xl", CHECKERBOARD_CLASS)}>
                      {item.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.image} alt="" className="max-h-16 w-auto object-contain" />
                      ) : (
                        <span className={cn("text-3xl", signatureFontById(item.font).font.className)} style={{ color: item.color ?? "#111827" }}>
                          {item.text}
                        </span>
                      )}
                    </div>
                    <span className="mt-2 flex items-center gap-2 text-xs font-semibold">
                      {selectedId === item.id ? <Check className="size-3.5 text-primary" /> : null}
                      {selectedId === item.id ? "Default signature" : "Set as default"}
                    </span>
                    <span className="mt-1 flex gap-1 text-[10px] uppercase tracking-wide text-muted-foreground"><span className="rounded bg-muted px-1.5 py-0.5">{item.source ?? "saved"}</span>{selectedId === item.id ? <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">Default</span> : null}</span>
                  </button>
                  <Input aria-label="Signature name" className="mt-2 h-8 pe-16 text-xs" value={item.name ?? "Signature"} onChange={(event) => setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, name: event.target.value } : entry))} />
                  <div className="absolute right-3 top-3 flex gap-1">
                    <button type="button" aria-label="Download PNG" onClick={() => openDownload(item)} className="rounded-lg bg-white/90 p-1.5 text-muted-foreground shadow hover:text-foreground">
                      <Download className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Delete signature"
                      onClick={() => {
                        if (!window.confirm(`Delete ${item.name ?? "this signature"}? Previously signed PDFs will not be affected.`)) return;
                        setItems((current) => current.filter((entry) => entry.id !== item.id));
                        if (selectedId === item.id) setSelectedId(items.find((entry) => entry.id !== item.id)?.id ?? "");
                      }}
                      className="rounded-lg bg-white/90 p-1.5 text-muted-foreground shadow hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          {initialItems.length ? <div className="mt-5"><p className="text-xs font-semibold text-muted-foreground">Saved initials</p><div className="mt-2 space-y-2">{initialItems.map((item, index) => <div key={item.id ?? index} className={cn("rounded-2xl border bg-background p-3", selectedInitialId === item.id && "border-primary ring-2 ring-primary/20")}><button type="button" className="w-full" onClick={() => { setSelectedInitialId(item.id ?? ""); setInitials(item); }}><div className={cn("flex h-14 items-center justify-center rounded-xl", CHECKERBOARD_CLASS)}>{item.image ? <Image src={item.image} alt="" width={160} height={48} unoptimized className="max-h-11 w-auto object-contain" /> : <span className={cn("text-3xl", signatureFontById(item.font ?? fontId).font.className)}>{item.text}</span>}</div><span className="mt-2 flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wide">{selectedInitialId === item.id ? <Check className="size-3 text-primary" /> : null}{item.name ?? "Initials"}{selectedInitialId === item.id ? " · Default" : ""}</span></button><div className="mt-2 flex gap-1"><Button size="sm" variant="outline" className="flex-1" onClick={() => openDownload({ ...item, name: item.name ?? "initials" })}><Download />PNG</Button><Button size="icon-sm" variant="ghost" aria-label="Delete initials" onClick={() => { if (!window.confirm("Delete these initials? Previously signed PDFs will not be affected.")) return; setInitialItems((current) => current.filter((entry) => entry.id !== item.id)); if (selectedInitialId === item.id) setSelectedInitialId(initialItems.find((entry) => entry.id !== item.id)?.id ?? ""); }}><Trash2 /></Button></div></div>)}</div></div> : null}
        </aside>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t p-6">
        {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : <span />}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!items.length}
            onClick={() => {
              const selected = items.find((item) => item.id === selectedId) ?? items[0];
              if (selected) openDownload(selected);
            }}
          >
            <Download />
            Download PNG
          </Button>
          <Button disabled={busy || items.length === 0 || !initials.text.trim()} onClick={() => void save()}>
            {busy ? <Loader2 className="animate-spin" /> : <Save />}
            Save signature library
          </Button>
        </div>
      </div>
      <Dialog open={Boolean(downloadTarget)} onOpenChange={(open) => { if (!open) setDownloadTarget(null); }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Download transparent PNG</DialogTitle>
            <DialogDescription>Choose a clear file name. The checkerboard only shows transparency and will not appear in the PNG.</DialogDescription>
          </DialogHeader>
          {downloadTarget ? (
            <div className={cn("grid min-h-48 place-items-center overflow-hidden rounded-2xl border p-6", CHECKERBOARD_CLASS)}>
              {downloadTarget.image ? <Image src={downloadTarget.image} alt="Signature preview" width={520} height={180} unoptimized className="max-h-40 w-auto object-contain" /> : <span className={cn("text-5xl", signatureFontById(downloadTarget.font).font.className)} style={{ color: downloadTarget.color ?? "#111827" }}>{downloadTarget.text}</span>}
            </div>
          ) : null}
          <div>
            <label htmlFor="signature-download-name" className="text-sm font-semibold">File name</label>
            <div className="mt-2 flex items-center rounded-xl border bg-background pe-3">
              <Input id="signature-download-name" value={downloadName} onChange={(event) => setDownloadName(event.target.value)} className="border-0 shadow-none focus-visible:ring-0" />
              <span className="text-sm text-muted-foreground">.png</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDownloadTarget(null)}>Cancel</Button>
            <Button disabled={!downloadName.trim() || !downloadTarget} onClick={() => { if (!downloadTarget) return; void downloadSelected({ ...downloadTarget, name: downloadName.trim() }); setDownloadTarget(null); }}><Download />Download PNG</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function normalizeImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => {
      const scale = Math.min(1, 1000 / image.naturalWidth, 320 / image.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Canvas unavailable"));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const r = pixels.data[i];
        const g = pixels.data[i + 1];
        const b = pixels.data[i + 2];
        if (r > 245 && g > 245 && b > 245) {
          pixels.data[i + 3] = 0;
        }
      }
      context.putImageData(pixels, 0, 0);
      resolve(trimTransparentCanvas(canvas).toDataURL("image/png"));
      URL.revokeObjectURL(image.src);
    };
    image.onerror = reject;
    image.src = URL.createObjectURL(file);
  });
}
