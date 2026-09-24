"use client";

import { ArrowUpRight, AtSign, Camera, Check, Download, FileImage, Loader2, PenLine, Save, Sparkles, Trash2, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMe, useUpdateProfile } from "@/hooks/use-envelope-api";

function getInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

export default function ProfileSettingsPage() {
  const meQuery = useMe();
  const user = meQuery.data?.user;
  const updateProfile = useUpdateProfile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (user) {
      setName(user.name);
      setAvatar(user.avatarDataUrl ?? null);
    }
  }, [user]);

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!(["image/png", "image/jpeg", "image/webp"].includes(file.type)) || file.size > 2 * 1024 * 1024) {
      setFormError("Choose a PNG, JPEG, or WebP image smaller than 2 MB.");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAvatar(String(reader.result));
      setFormError("");
    };
    reader.readAsDataURL(file);
  }

  async function saveProfile() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError("Enter your name before saving.");
      return;
    }
    setFormError("");
    try {
      await updateProfile.mutateAsync({ name: trimmedName, avatarDataUrl: avatar });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to save your profile.");
    }
  }

  if (meQuery.isLoading || !user) {
    return (
      <main className="mx-auto w-full max-w-5xl px-3 py-6 sm:px-0 lg:py-10">
        <div className="flex min-h-[420px] items-center justify-center rounded-3xl border bg-card">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading profile…</div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-3 py-6 sm:px-0 lg:py-10">
      <div className="space-y-8">
        <header className="relative overflow-hidden rounded-[2rem] border bg-card px-6 py-7 shadow-sm sm:px-8 sm:py-9">
          <div className="pointer-events-none absolute -right-20 -top-28 size-72 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-36 right-36 size-64 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
            <div className="flex size-20 shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-600 to-blue-500 bg-cover bg-center text-2xl font-semibold text-white shadow-[0_18px_38px_-18px_rgba(37,99,235,.75)] ring-4 ring-blue-500/10 sm:size-24 sm:text-3xl" style={avatar ? { backgroundImage: `url(${avatar})` } : undefined}>
              {!avatar && (getInitials(name || user.email) || "?")}
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">Personal profile</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300"><Check className="size-3" /> Verified</span>
              </div>
              <h1 className="truncate text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">{name || user.name}</h1>
              <p className="mt-2 text-sm text-muted-foreground">Manage the identity that appears across your workspace and signed documents.</p>
            </div>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(340px,.78fr)]">
          <section className="rounded-[2rem] border bg-card p-6 shadow-sm sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Account details</p><h2 className="mt-2 text-xl font-semibold tracking-tight">Your identity</h2></div>
              <div className="rounded-2xl bg-blue-50 p-3 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300"><UserRound className="size-5" /></div>
            </div>
            <div className="mt-7 space-y-6">
              <div className="grid gap-4 sm:grid-cols-[140px_1fr] sm:items-start">
                <label className="flex items-center gap-2 pt-2.5 text-sm text-muted-foreground" htmlFor="profile-photo"><Camera className="size-4" /> Photo</label>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-blue-500 bg-cover bg-center text-xl font-semibold text-white ring-1 ring-border" style={avatar ? { backgroundImage: `url(${avatar})` } : undefined}>{!avatar && (getInitials(name || user.email) || "?")}</div>
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}><Camera /> {avatar ? "Change photo" : "Upload photo"}</Button>
                      {avatar && <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setAvatar(null)}><Trash2 /> Remove</Button>}
                    </div>
                    <p className="text-xs text-muted-foreground">PNG, JPEG, or WebP. Maximum 2 MB.</p>
                    <input ref={fileInputRef} id="profile-photo" className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={choosePhoto} />
                  </div>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-[140px_1fr] sm:items-center">
                <label className="flex items-center gap-2 text-sm text-muted-foreground" htmlFor="profile-name"><UserRound className="size-4" /> Display name</label>
                <Input id="profile-name" value={name} maxLength={100} onChange={(event) => setName(event.target.value)} placeholder="Your full name" />
              </div>
              <div className="grid gap-2 sm:grid-cols-[140px_1fr] sm:items-center">
                <span className="flex items-center gap-2 text-sm text-muted-foreground"><AtSign className="size-4" /> Email</span>
                <div><p className="min-w-0 break-all font-medium">{user.email}</p><p className="mt-1 text-xs text-muted-foreground">Managed by your sign-in account</p></div>
              </div>
            </div>
            <div className="mt-7 flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm"><span className={formError ? "text-destructive" : "text-emerald-600"}>{formError || (updateProfile.isSuccess ? "Your profile has been saved." : "")}</span></div>
              <Button type="button" onClick={saveProfile} disabled={updateProfile.isPending || !name.trim()}><Save /> {updateProfile.isPending ? "Saving…" : "Save changes"}</Button>
            </div>
          </section>

          <section className="group relative overflow-hidden rounded-[2rem] border border-blue-200/70 bg-gradient-to-br from-blue-50 via-white to-cyan-50 p-6 shadow-[0_24px_60px_-35px_rgba(37,99,235,.5)] dark:border-blue-500/20 dark:from-blue-950/40 dark:via-card dark:to-cyan-950/30 sm:p-8">
            <div className="absolute right-5 top-5 rounded-full bg-white/80 p-2 text-blue-600 shadow-sm ring-1 ring-blue-500/10 backdrop-blur dark:bg-white/5 dark:text-blue-300"><Sparkles className="size-4" /></div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-600 dark:text-blue-400">Signature studio</p>
            <h2 className="mt-2 max-w-xs text-2xl font-semibold tracking-[-0.035em]">Make your mark, your way.</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Draw, type, or upload a signature and initials ready for every document.</p>
            <div className="relative mt-6 overflow-hidden rounded-2xl border border-blue-100 bg-white/90 p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
              <div className="absolute inset-x-0 bottom-7 border-t border-dashed border-blue-200/80 dark:border-blue-400/20" />
              <div className="relative flex h-24 items-center justify-center"><span className="-rotate-3 select-none font-serif text-4xl italic tracking-tight text-slate-800 dark:text-slate-100">{name || user.name}</span></div>
              <div className="relative mt-2 flex items-center justify-between text-[11px] text-muted-foreground"><span className="flex items-center gap-1.5"><PenLine className="size-3" /> Signature preview</span><span>Transparent PNG</span></div>
            </div>
            <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs font-medium text-muted-foreground">
              <span className="flex items-center gap-1.5"><PenLine className="size-3.5 text-blue-600" /> Draw or type</span>
              <span className="flex items-center gap-1.5"><FileImage className="size-3.5 text-blue-600" /> Upload</span>
              <span className="flex items-center gap-1.5"><Download className="size-3.5 text-blue-600" /> Download</span>
            </div>
            <Button asChild className="mt-6 h-11 w-full rounded-xl shadow-[0_12px_28px_-14px_rgba(37,99,235,.8)]"><Link href="/signature">Open signature studio <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></Link></Button>
          </section>
        </div>
      </div>
    </main>
  );
}
