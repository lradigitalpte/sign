import Link from "next/link";
import { ArrowRight, Check, ChevronRight, Clock3, FileCheck2, Fingerprint, Layers3, LockKeyhole, MousePointer2, PenLine, ShieldCheck, Sparkles, UploadCloud, Users } from "lucide-react";

const steps = [
  { number: "01", icon: UploadCloud, title: "Upload your document", copy: "Drop in a PDF or choose a reusable template. We keep every page crisp and ready for fields." },
  { number: "02", icon: Users, title: "Add people and fields", copy: "Set the signing order, place fields, and add clear instructions for every recipient." },
  { number: "03", icon: PenLine, title: "Send, sign, done", copy: "Everyone signs from any device. You get the completed agreement and a detailed audit trail." },
];

const features = [
  { icon: ShieldCheck, title: "Built for trust", copy: "Every action is recorded in a tamper-evident audit trail, from the first view to the final signature." },
  { icon: Clock3, title: "Minutes, not meetings", copy: "Reusable templates, clear reminders, and a focused signing flow keep agreements moving." },
  { icon: Layers3, title: "Everything in order", copy: "Track every document, signer, and status from one calm workspace built for real teams." },
];

function Mark({ inverted = false }: { inverted?: boolean }) {
  return <span className={`grid size-9 place-items-center rounded-[11px] ${inverted ? "bg-[#dbeafe] text-[#153b75]" : "bg-[#153b75] text-[#dbeafe]"}`} aria-hidden="true">
    <svg viewBox="0 0 24 24" className="size-5 fill-none" stroke="currentColor" strokeWidth="2.2"><path d="M6 3.5h7l5 5V20.5H6z" strokeLinejoin="round" /><path d="M13 3.5v5h5M8.8 15.1l1.8 1.8 4.8-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
  </span>;
}

export default function Home() {
  return <main id="top" className="overflow-hidden bg-[#f7faff] text-[#153b75]">
    <header className="relative z-50 border-b border-[#153b75]/10 bg-[#f7faff]/90 backdrop-blur-xl">
      <nav className="mx-auto flex h-[76px] max-w-[1240px] items-center justify-between px-5 sm:px-8">
        <Link href="#top" className="flex items-center gap-2.5" aria-label="Signet home"><Mark /><span className="text-[21px] font-bold tracking-[-0.04em]">signet</span></Link>
        <div className="hidden items-center gap-8 text-sm font-medium text-[#4b6486] md:flex">
          <Link href="#how-it-works" className="transition hover:text-[#153b75]">How it works</Link><Link href="#features" className="transition hover:text-[#153b75]">Features</Link><Link href="#security" className="transition hover:text-[#153b75]">Security</Link>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/signin" className="px-2 py-2 text-sm font-semibold transition hover:text-[#2563eb] sm:px-4">Sign in</Link>
          <Link href="/signup" className="group inline-flex h-10 items-center gap-2 rounded-full bg-[#153b75] px-4 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] sm:px-5">Get started <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" /></Link>
        </div>
      </nav>
    </header>

    <section className="relative border-b border-[#153b75]/10">
      <div className="pointer-events-none absolute -right-24 top-10 size-[460px] rounded-full bg-[#dbeafe]/75 blur-3xl" /><div className="pointer-events-none absolute -left-24 bottom-0 size-72 rounded-full bg-[#e0eaff]/60 blur-3xl" />
      <div className="relative mx-auto grid max-w-[1240px] items-center gap-14 px-5 py-16 sm:px-8 sm:py-20 lg:min-h-[700px] lg:grid-cols-[0.92fr_1.08fr] lg:gap-10 lg:py-24">
        <div className="relative z-10 max-w-[620px]">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#153b75]/15 bg-white/55 px-3 py-1.5 text-xs font-semibold text-[#335a91] shadow-sm"><Sparkles className="size-3.5 text-[#2563eb]" />Agreements, without the busywork</div>
          <h1 className="text-[3.45rem] font-semibold leading-[0.95] tracking-[-0.065em] text-balance sm:text-[4.7rem] lg:text-[5.25rem]">Sign work.<span className="block text-[#3970bb]">Not paperwork.</span></h1>
          <p className="mt-7 max-w-[530px] text-lg leading-8 text-[#587092] sm:text-xl">Prepare, send, and sign agreements in one beautifully simple workspace. Built for teams who would rather get to yes.</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/signup" className="group inline-flex h-13 items-center justify-center gap-2 rounded-full bg-[#153b75] px-7 text-sm font-bold text-white shadow-[0_12px_30px_-12px_rgba(21,59,117,0.65)] transition hover:-translate-y-0.5 hover:bg-[#1d4ed8]">Start signing for free <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></Link>
            <Link href="#how-it-works" className="inline-flex h-13 items-center justify-center gap-2 rounded-full border border-[#153b75]/20 bg-white/45 px-7 text-sm font-bold transition hover:border-[#153b75]/40 hover:bg-white/80">See how it works <ChevronRight className="size-4" /></Link>
          </div>
          <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-xs font-medium text-[#667d9b]"><span className="flex items-center gap-1.5"><Check className="size-3.5" />No credit card</span><span className="flex items-center gap-1.5"><Check className="size-3.5" />Set up in 2 minutes</span><span className="flex items-center gap-1.5"><Check className="size-3.5" />Cancel anytime</span></div>
        </div>

        <div className="relative mx-auto w-full max-w-[620px] lg:translate-x-8">
          <div className="absolute -left-5 top-14 z-20 hidden items-center gap-2 rounded-full border border-white/70 bg-white/90 px-4 py-2 text-xs font-semibold shadow-[0_14px_40px_-18px_rgba(21,59,117,.4)] backdrop-blur sm:flex"><span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-[#3b82f6] opacity-50" /><span className="relative inline-flex size-2 rounded-full bg-[#3b82f6]" /></span>Alex is signing</div>
          <div className="hero-card relative rotate-[1.5deg] rounded-[30px] border border-[#153b75]/10 bg-[#e5eefb] p-3 shadow-[0_35px_80px_-34px_rgba(21,59,117,.55)] sm:p-4">
            <div className="overflow-hidden rounded-[22px] border border-[#153b75]/10 bg-white">
              <div className="flex items-center justify-between border-b border-[#153b75]/10 px-5 py-4"><div className="flex items-center gap-3"><Mark /><div><p className="text-xs font-bold">Service agreement</p><p className="mt-0.5 text-[10px] text-[#8092aa]">3 pages · 2 signers</p></div></div><span className="rounded-full bg-[#e8f1ff] px-3 py-1 text-[10px] font-bold text-[#245db0]">In progress</span></div>
              <div className="grid bg-[#eef4fc] p-4 sm:grid-cols-[1fr_132px] sm:p-6">
                <div className="relative min-h-[430px] overflow-hidden rounded-[4px] bg-white px-8 py-9 shadow-[0_8px_24px_-14px_rgba(21,59,117,.35)] sm:px-11">
                  <div className="flex items-start justify-between"><div><div className="h-2 w-16 rounded-full bg-[#153b75]" /><div className="mt-2 h-1.5 w-10 rounded-full bg-[#b8c8df]" /></div><div className="grid size-8 place-items-center rounded-lg bg-[#153b75] text-[#dbeafe]"><FileCheck2 className="size-4" /></div></div>
                  <p className="mt-10 text-[9px] font-bold uppercase tracking-[0.16em] text-[#8899b2]">Independent services</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.045em]">Service Agreement</h2>
                  <div className="mt-6 space-y-2"><div className="h-1.5 w-full rounded-full bg-[#e6edf7]" /><div className="h-1.5 w-[92%] rounded-full bg-[#e6edf7]" /><div className="h-1.5 w-[96%] rounded-full bg-[#e6edf7]" /><div className="h-1.5 w-[68%] rounded-full bg-[#e6edf7]" /></div>
                  <div className="mt-7 space-y-2"><div className="h-1.5 w-full rounded-full bg-[#e6edf7]" /><div className="h-1.5 w-[88%] rounded-full bg-[#e6edf7]" /><div className="h-1.5 w-[75%] rounded-full bg-[#e6edf7]" /></div>
                  <div className="absolute bottom-9 left-8 right-8 sm:left-11 sm:right-11"><p className="mb-2 text-[8px] font-bold uppercase tracking-[0.14em] text-[#7d90aa]">Your signature</p><div className="relative flex h-[70px] items-center rounded-xl border-2 border-[#3b82f6] bg-[#eff6ff] px-5"><span className="font-serif text-2xl italic tracking-[-0.06em]">Alex Morgan</span><div className="absolute -right-2.5 -top-2.5 grid size-6 place-items-center rounded-full bg-[#3b82f6] text-white shadow-md"><Check className="size-3.5" strokeWidth={3} /></div><MousePointer2 className="absolute -bottom-5 right-9 size-6 fill-[#153b75] text-[#153b75]" /></div></div>
                </div>
                <aside className="hidden flex-col gap-3 pl-4 sm:flex"><p className="px-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[#7186a3]">Required fields</p><div className="rounded-xl border border-[#3b82f6]/30 bg-[#eff6ff] p-3"><PenLine className="size-4 text-[#2563eb]" /><p className="mt-6 text-[10px] font-bold">Signature</p><p className="mt-0.5 text-[8px] text-[#7d90aa]">Completed</p></div><div className="rounded-xl border border-[#153b75]/10 bg-white p-3"><div className="size-4 rounded border border-[#8fa2bf]" /><p className="mt-6 text-[10px] font-bold">Full name</p><p className="mt-0.5 text-[8px] text-[#7d90aa]">Up next</p></div><div className="mt-auto rounded-xl bg-[#153b75] p-3 text-white"><div className="flex items-center gap-1.5 text-[8px] font-semibold text-white/65"><LockKeyhole className="size-3" />Secure session</div><p className="mt-2 text-[9px] leading-relaxed text-white/80">Your progress is saved automatically.</p></div></aside>
              </div>
            </div>
          </div>
          <div className="absolute -bottom-6 -right-2 z-20 rounded-2xl border border-white/70 bg-white/95 p-3.5 shadow-[0_18px_45px_-18px_rgba(21,59,117,.45)] backdrop-blur sm:right-[-18px] sm:flex sm:items-center sm:gap-3"><div className="grid size-10 place-items-center rounded-xl bg-[#e8f1ff] text-[#2563eb]"><Fingerprint className="size-5" /></div><div className="hidden sm:block"><p className="text-[11px] font-bold">Identity verified</p><p className="mt-0.5 text-[9px] text-[#8092aa]">Protected at every step</p></div></div>
        </div>
      </div>
    </section>

    <section className="bg-[#153b75] text-white"><div className="mx-auto flex max-w-[1240px] flex-col items-center justify-between gap-6 px-5 py-8 text-center sm:px-8 lg:flex-row lg:text-left"><p className="text-sm font-medium text-white/65">Trusted for the moments that move work forward</p><div className="flex flex-wrap items-center justify-center gap-x-9 gap-y-4 text-sm font-bold tracking-tight text-white/85 sm:text-base"><span>Northstar</span><span className="font-serif italic">atelier</span><span>HEARTH</span><span className="tracking-[0.16em]">KONTUR</span><span>Fieldwork.</span></div></div></section>

    <section id="how-it-works" className="bg-[#ffffff] px-5 py-24 sm:px-8 sm:py-32"><div className="mx-auto max-w-[1160px]"><div className="mx-auto max-w-2xl text-center"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#2563eb]">Simple by design</p><h2 className="mt-4 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">From draft to done in three steps.</h2><p className="mx-auto mt-5 max-w-xl text-base leading-7 text-[#607793]">No training manual. No clutter. Just a guided path from a document on your desk to an agreement in your hands.</p></div><div className="mt-16 grid gap-5 md:grid-cols-3">{steps.map(({ number, icon: Icon, title, copy }) => <article key={number} className="group relative rounded-[24px] border border-[#153b75]/10 bg-[#f7faff] p-7 transition duration-300 hover:-translate-y-1 hover:shadow-[0_20px_45px_-28px_rgba(21,59,117,.35)]"><div className="flex items-start justify-between"><div className="grid size-12 place-items-center rounded-2xl bg-[#e4efff] text-[#2563eb]"><Icon className="size-5" /></div><span className="font-mono text-xs text-[#8597b1]">{number}</span></div><h3 className="mt-8 text-xl font-bold tracking-[-0.035em]">{title}</h3><p className="mt-3 text-sm leading-6 text-[#617994]">{copy}</p></article>)}</div></div></section>

    <section id="features" className="bg-[#eaf2ff] px-5 py-24 sm:px-8 sm:py-32"><div className="mx-auto grid max-w-[1160px] gap-14 lg:grid-cols-[0.8fr_1.2fr] lg:gap-24"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#2563eb]">A calmer way to agree</p><h2 className="mt-4 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">The confidence to keep work moving.</h2><p className="mt-5 max-w-md text-base leading-7 text-[#5b7494]">Signet handles the details behind every signature, so your team can focus on the relationship—not the paperwork.</p><Link href="/signup" className="group mt-8 inline-flex items-center gap-2 text-sm font-bold underline decoration-[#3b82f6] decoration-2 underline-offset-4">Explore the workspace <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" /></Link></div><div className="divide-y divide-[#153b75]/12 border-y border-[#153b75]/12">{features.map(({ icon: Icon, title, copy }) => <div key={title} className="grid gap-4 py-7 sm:grid-cols-[56px_170px_1fr] sm:items-start sm:gap-5"><div className="grid size-11 place-items-center rounded-2xl border border-[#153b75]/10 bg-white/50"><Icon className="size-5" /></div><h3 className="text-lg font-bold tracking-[-0.03em] sm:pt-2">{title}</h3><p className="text-sm leading-6 text-[#5b7392] sm:pt-2">{copy}</p></div>)}</div></div></section>

    <section id="security" className="bg-[#ffffff] px-5 py-20 sm:px-8 sm:py-28"><div className="relative mx-auto max-w-[1160px] overflow-hidden rounded-[32px] bg-[#153b75] px-7 py-14 text-white sm:px-14 sm:py-16 lg:px-20"><div className="absolute -right-16 -top-24 size-80 rounded-full border border-white/10" /><div className="absolute -right-3 -top-10 size-52 rounded-full border border-[#dbeafe]/20" /><div className="relative z-10 grid items-center gap-10 lg:grid-cols-[1fr_auto]"><div className="max-w-2xl"><div className="mb-5 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#dbeafe]"><LockKeyhole className="size-4" />Security comes standard</div><h2 className="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">Your next agreement is closer than you think.</h2><p className="mt-5 max-w-xl text-base leading-7 text-white/65">Create your workspace, upload a document, and send it for signature today.</p></div><Link href="/signup" className="group inline-flex h-13 w-fit items-center gap-2 rounded-full bg-[#dbeafe] px-7 text-sm font-bold text-[#153b75] transition hover:-translate-y-0.5 hover:bg-white">Start for free <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></Link></div></div></section>

    <footer className="border-t border-[#153b75]/10 bg-[#f7faff] px-5 sm:px-8"><div className="mx-auto flex max-w-[1160px] flex-col gap-6 py-8 sm:flex-row sm:items-center sm:justify-between"><Link href="#top" className="flex items-center gap-2.5"><Mark /><span className="text-lg font-bold tracking-[-0.04em]">signet</span></Link><div className="flex flex-wrap gap-6 text-xs font-medium text-[#607793]"><Link href="#features">Features</Link><Link href="#security">Security</Link><Link href="/signin">Sign in</Link><Link href="/signup">Create account</Link></div><p className="text-xs text-[#8294ad]">© 2026 Signet, Inc.</p></div></footer>
  </main>;
}
