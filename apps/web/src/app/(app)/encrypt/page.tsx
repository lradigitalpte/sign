"use client";

import { CheckCircle2, Copy, Eye, EyeOff, FileCheck2, FileKey2, History, Loader2, LockKeyhole, RefreshCw, ShieldCheck, UnlockKeyhole } from "lucide-react";
import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import { DocumentDropzone } from "@/components/shared/document-dropzone";
import { VaultFiles } from "@/components/pdf-security/vault-files";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePlatformToken } from "@/hooks/use-envelope-api";
import { platformApiUrl } from "@/lib/platform-api";

type Mode = "encrypt" | "decrypt" | "verify" | "files";
type HistoryItem = { id: string; name: string; action: "Encrypted" | "Decrypted" | "Verified"; size: number; date: string; fingerprint?: string };
const storageKey = "signing-platform:pdf-security-history";

const tabs = [
  { id: "files", label: "All files", description: "Recent activity", href: "/encrypt/files", icon: History },
  { id: "encrypt", label: "Encrypt PDF", description: "Add password protection", href: "/encrypt", icon: LockKeyhole },
  { id: "decrypt", label: "Decrypt PDF", description: "Remove protection", href: "/encrypt/decrypt", icon: UnlockKeyhole },
  { id: "verify", label: "Verify document", description: "Check PDF integrity", href: "/encrypt/verify", icon: ShieldCheck },
] as const;

function passwordValue() {
  const value = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return value.toString().padStart(6, "0");
}

export default function EncryptPage() {
  const pathname = usePathname();
  const mode: Mode = pathname.endsWith("/decrypt") ? "decrypt" : pathname.endsWith("/files") ? "files" : pathname.endsWith("/verify") ? "verify" : "encrypt";
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ message: string; fingerprint?: string } | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(storageKey) ?? "[]") as HistoryItem[]; } catch { return []; }
  });
  const { getAccessToken } = usePlatformToken();

  const title = useMemo(() => tabs.find((tab) => tab.id === mode)?.label ?? "PDF security", [mode]);
  const saveHistory = (item: HistoryItem) => { const next = [item, ...history].slice(0, 50); setHistory(next); localStorage.setItem(storageKey, JSON.stringify(next)); };

  const process = async () => {
    if (!file) { setError("Choose a PDF first."); return; }
    if (mode !== "verify" && !password) { setError("Enter or generate a password."); return; }
    setBusy(true); setError(""); setResult(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Your session has expired.");
      const body = new FormData(); body.append("file", file); if (mode !== "verify") body.append("password", password);
      const response = await fetch(`${platformApiUrl}/v1/pdf-security/${mode}`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body });
      if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.error ?? "Unable to process this PDF."); }
      if (mode === "verify") {
        const payload = await response.json();
        const message = payload.valid ? "PDF structure is valid" : "PDF validation failed";
        setResult({ message, fingerprint: payload.sha256 });
        saveHistory({ id: crypto.randomUUID(), name: file.name, action: "Verified", size: file.size, date: new Date().toISOString(), fingerprint: payload.sha256 });
      } else {
        const blob = await response.blob();
        const disposition = response.headers.get("Content-Disposition") ?? "";
        const name = disposition.match(/filename="([^"]+)"/)?.[1] ?? `${file.name.replace(/\.pdf$/i, "")}-${mode}.pdf`;
        const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
        setResult({ message: mode === "encrypt" ? "Encrypted PDF downloaded" : "Decrypted PDF downloaded" });
        saveHistory({ id: crypto.randomUUID(), name, action: mode === "encrypt" ? "Encrypted" : "Decrypted", size: blob.size, date: new Date().toISOString() });
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Something went wrong."); } finally { setBusy(false); }
  };

  return <main className="mx-auto w-full max-w-[1320px] px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
      <section className="min-w-0 overflow-hidden rounded-3xl border bg-background shadow-sm">
        <header className="border-b px-5 py-6 sm:px-7"><p className="text-xs font-semibold uppercase tracking-[.14em] text-primary">Document security</p><div className="mt-2 flex items-start gap-3"><span className="mt-0.5 grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><FileKey2 className="size-5" /></span><div><h2 className="text-2xl font-semibold tracking-[-.035em]">{title}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{mode === "encrypt" ? "Lock a PDF with a password before sharing or storing it." : mode === "decrypt" ? "Remove password protection from a PDF you are authorized to access." : mode === "verify" ? "Validate PDF structure and calculate its unique SHA-256 fingerprint." : "Your recent PDF security activity on this device."}</p></div></div></header>
        <div className="p-5 sm:p-7">
        {mode === "files" ? <><VaultFiles />{history.length ? <div className="mt-8"><p className="text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground">Legacy device activity</p><div className="mt-3"><HistoryList items={history} /></div></div> : null}</> : <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <DocumentDropzone fileName={file?.name} label={mode === "decrypt" ? "Upload protected PDF" : "Upload PDF"} description="Drag and drop a PDF, or click to browse. Maximum 25 MB." onFile={(next) => { setFile(next); setResult(null); setError(""); }} />
          <div className="space-y-4 rounded-3xl border bg-background p-5">
            {mode !== "verify" ? <><label className="text-sm font-semibold">Password</label><div className="relative"><Input className="pe-11" type={visible ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="6-digit password" /><button aria-label={visible ? "Hide password" : "Show password"} className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setVisible(!visible)}>{visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div><div className="flex gap-2"><Button type="button" variant="outline" className="flex-1" onClick={() => { setPassword(passwordValue()); setVisible(true); }}><RefreshCw />Generate</Button><Button type="button" variant="outline" size="icon" disabled={!password} onClick={() => navigator.clipboard.writeText(password)}><Copy /></Button></div><p className="text-xs leading-5 text-muted-foreground">The password is encrypted in the server vault. Authorized reveals are audited.</p></> : <div className="rounded-2xl bg-blue-500/8 p-4 text-sm leading-6 text-muted-foreground"><FileCheck2 className="mb-2 size-5 text-blue-600" />Verification checks file structure and creates a fingerprint. Issuer authenticity requires a registered digital signature.</div>}
            {error ? <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
            {result ? <div className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-700"><p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="size-4" />{result.message}</p>{result.fingerprint ? <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">{result.fingerprint}</p> : null}</div> : null}
            <Button className="w-full" size="lg" disabled={busy || !file} onClick={() => void process()}>{busy ? <Loader2 className="animate-spin" /> : mode === "encrypt" ? <LockKeyhole /> : mode === "decrypt" ? <UnlockKeyhole /> : <ShieldCheck />}{busy ? "Processing…" : title}</Button>
          </div>
        </div>}
        </div>
      </section>
  </main>;
}

function HistoryList({ items }: { items: HistoryItem[] }) {
  if (!items.length) return <div className="mt-8 rounded-3xl border border-dashed p-12 text-center"><History className="mx-auto size-8 text-muted-foreground/50" /><p className="mt-3 font-semibold">No PDF activity yet</p><p className="mt-1 text-sm text-muted-foreground">Encrypted, decrypted, and verified files will appear here.</p></div>;
  return <div className="mt-6 divide-y rounded-2xl border bg-background px-4">{items.map((item) => <div className="flex items-center gap-3 py-4" key={item.id}><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><FileKey2 className="size-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{item.action} · {(item.size / 1024).toFixed(1)} KB · {new Date(item.date).toLocaleString()}</p></div><span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700">{item.action}</span></div>)}</div>;
}
