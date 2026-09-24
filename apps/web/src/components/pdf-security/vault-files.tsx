"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Copy, Download, Eye, EyeOff, FileKey2, Info, Loader2, LockKeyhole, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";

import { StatusBadge } from "@/components/shared/status-badge";
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
import { usePlatformToken, useSecuredPDFs } from "@/hooks/use-envelope-api";
import { deleteSecuredPDF, fetchSecuredPDF, revealSecuredPDFPassword, rotateSecuredPDFPassword, type SecuredPDF } from "@/lib/platform-api";
import { cn } from "@/lib/utils";

export function VaultFiles() {
  const files = useSecuredPDFs();
  const { getAccessToken } = usePlatformToken();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<SecuredPDF | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [working, setWorking] = useState("");
  const [rotationPassword,setRotationPassword]=useState("");

  const token = async () => {
    const value = await getAccessToken();
    if (!value) throw new Error("Not authenticated");
    return value;
  };

  const open = async (file: SecuredPDF, download = false) => {
    setWorking(file.id);
    try {
      const blob = await fetchSecuredPDF(await token(), file.id);
      const url = URL.createObjectURL(blob);
      if (download) {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = file.filename;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    } finally {
      setWorking("");
    }
  };

  const reveal = async (file: SecuredPDF) => {
    setWorking(file.id);
    try {
      const value = await revealSecuredPDFPassword(await token(), file.id);
      setPassword(value.password);
      setShowPassword(true);
    } finally {
      setWorking("");
    }
  };

  const remove = async (file: SecuredPDF) => {
    if (!confirm(`Delete ${file.filename}? Its audit record will be retained.`)) return;
    setWorking(file.id);
    try {
      await deleteSecuredPDF(await token(), file.id);
      setSelected(null);
      await queryClient.invalidateQueries({ queryKey: ["secured-pdfs"] });
    } finally {
      setWorking("");
    }
  };

  const closeDetails = () => {
    setSelected(null);
    setPassword("");
    setShowPassword(false);
  };
  const rotate=async(file:SecuredPDF)=>{if(rotationPassword.length<8)return;setWorking(file.id);try{await rotateSecuredPDFPassword(await token(),file.id,rotationPassword);setPassword(rotationPassword);setShowPassword(true);setRotationPassword("");await queryClient.invalidateQueries({queryKey:["secured-pdfs"]})}finally{setWorking("")}};

  if (files.isLoading) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading secured files…
      </div>
    );
  }

  if (files.isError) {
    return (
      <div className="rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">
        Unable to load the secure file vault.{" "}
        <button type="button" className="underline" onClick={() => void files.refetch()}>
          Try again
        </button>
      </div>
    );
  }

  if (!files.data?.length) {
    return (
      <div className="rounded-3xl border border-dashed p-12 text-center">
        <FileKey2 className="mx-auto size-8 text-muted-foreground/50" />
        <p className="mt-3 font-semibold">No vaulted PDFs yet</p>
        <p className="mt-1 text-sm text-muted-foreground">New encrypted and decrypted files will be stored here.</p>
      </div>
    );
  }

  return (
    <>
      <div className="divide-y rounded-2xl border bg-background px-4">
        {files.data.map((file) => (
          <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center" key={file.id}>
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <FileKey2 className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{file.filename}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                <span className="capitalize">{file.operation}</span> · {(file.sizeBytes / 1024).toFixed(1)} KB ·{" "}
                {new Date(file.createdAt).toLocaleString()} · Password v{file.passwordVersion}
              </p>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" disabled={working === file.id} onClick={() => void open(file)}>
                {working === file.id ? <Loader2 className="animate-spin" /> : <Eye />}
                View
              </Button>
              <Button variant="ghost" size="icon" title="Download" onClick={() => void open(file, true)}>
                <Download />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="Details"
                onClick={() => {
                  setSelected(file);
                  setPassword("");
                  setShowPassword(false);
                }}
              >
                <Info />
              </Button>
              <Button variant="ghost" size="icon" title="Delete" className="text-destructive" onClick={() => void remove(file)}>
                <Trash2 />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && closeDetails()}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-3xl">
          {selected ? (
            <>
              <DialogHeader className="border-b px-6 py-5 sm:px-8">
                <div className="flex items-start gap-4 pe-8">
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <FileKey2 className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <DialogTitle className="text-xl font-semibold leading-snug tracking-[-0.02em]">
                      {selected.filename}
                    </DialogTitle>
                    <DialogDescription className="mt-2 text-sm">
                      Created {new Date(selected.createdAt).toLocaleString()}
                    </DialogDescription>
                    <div className="mt-3">
                      <StatusBadge tone={selected.operation === "encrypted" ? "info" : "success"}>
                        {selected.operation === "encrypted" ? "Encrypted" : "Decrypted"}
                      </StatusBadge>
                    </div>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-6 px-6 py-6 sm:px-8">
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">File information</h3>
                  <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                    <DetailCard label="Source file" value={selected.sourceFilename} />
                    <DetailCard label="Operation" value={selected.operation} capitalize />
                    <DetailCard label="File size" value={`${(selected.sizeBytes / 1024).toFixed(1)} KB`} />
                    <DetailCard label="Password version" value={`v${selected.passwordVersion}`} />
                  </dl>
                </section>

                <section>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">SHA-256 fingerprint</h3>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2"
                      onClick={() => navigator.clipboard.writeText(selected.sha256)}
                    >
                      <Copy className="size-3.5" />
                      Copy
                    </Button>
                  </div>
                  <p className="mt-2 break-all rounded-2xl border bg-muted/40 px-4 py-3 font-mono text-xs leading-6 text-foreground">
                    {selected.sha256}
                  </p>
                </section>

                <section className="rounded-2xl border bg-muted/20 p-5">
                  <div className="flex items-center gap-2">
                    <LockKeyhole className="size-4 text-primary" />
                    <h3 className="text-sm font-semibold">Vault password</h3>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Reveal is audited. Only authorized workspace members can view the stored password.
                  </p>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <Input
                      readOnly
                      className="h-12 flex-1 font-mono text-base tracking-widest"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      placeholder="Click Reveal to show the stored password"
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-12 min-w-[120px]"
                        disabled={working === selected.id}
                        onClick={() => (password ? setShowPassword(!showPassword) : void reveal(selected))}
                      >
                        {working === selected.id ? (
                          <Loader2 className="animate-spin" />
                        ) : showPassword ? (
                          <EyeOff />
                        ) : (
                          <Eye />
                        )}
                        {password ? (showPassword ? "Hide" : "Show") : "Reveal"}
                      </Button>
                      {password ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-12 shrink-0"
                          onClick={() => navigator.clipboard.writeText(password)}
                        >
                          <Copy />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ShieldCheck className="size-3.5" />
                    Every password reveal is recorded in the audit trail.
                  </p>
                </section>
                {selected.operation === "encrypted" ? <section className="rounded-2xl border p-5"><div className="flex items-center gap-2"><RefreshCw className="size-4 text-primary"/><h3 className="text-sm font-semibold">Rotate compromised password</h3></div><p className="mt-1 text-xs text-muted-foreground">Creates a newly encrypted PDF and retires the previous password version.</p><div className="mt-4 flex gap-2"><Input value={rotationPassword} onChange={e=>setRotationPassword(e.target.value)} placeholder="New password (8+ characters)"/><Button disabled={rotationPassword.length<8||working===selected.id} onClick={()=>void rotate(selected)}><RefreshCw/>Rotate</Button></div></section> : null}
              </div>

              <DialogFooter className="border-t px-6 py-4 sm:px-8">
                <Button type="button" variant="outline" onClick={() => void open(selected)}>
                  <Eye />
                  View PDF
                </Button>
                <Button type="button" variant="outline" onClick={() => void open(selected, true)}>
                  <Download />
                  Download
                </Button>
                <Button type="button" variant="destructive" onClick={() => void remove(selected)}>
                  <Trash2 />
                  Delete
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function DetailCard({ label, value, capitalize = false }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div className="rounded-2xl border bg-background px-4 py-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1.5 break-words text-sm font-semibold leading-5", capitalize && "capitalize")} title={value}>
        {value}
      </dd>
    </div>
  );
}
