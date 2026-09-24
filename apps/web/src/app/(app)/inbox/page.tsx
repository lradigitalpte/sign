"use client";

import { ArrowRight, CheckCircle2, FileSignature, Loader2, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { useInbox, usePlatformToken } from "@/hooks/use-envelope-api";
import { accessInboxItem, type InboxItem } from "@/lib/platform-api";
import { cn } from "@/lib/utils";

export default function InboxPage() {
  const t = useTranslations("Inbox");
  const router = useRouter();
  const { getAccessToken } = usePlatformToken();
  const inboxQuery = useInbox();
  const [tab, setTab] = useState<"pending" | "completed">("pending");
  const [query, setQuery] = useState("");
  const [openingId, setOpeningId] = useState<string | null>(null);
  const items = inboxQuery.data ?? [];
  const pending = items.filter((item) => item.status === "sent" || item.status === "viewed");
  const completed = items.filter((item) => item.status === "completed" || item.status === "declined");
  const visibleItems = useMemo(() => {
    const source = tab === "pending" ? pending : completed;
    const needle = query.trim().toLowerCase();
    return needle ? source.filter((item) => `${item.title} ${item.senderName} ${item.companyName}`.toLowerCase().includes(needle)) : source;
  }, [completed, pending, query, tab]);

  const openItem = async (item: InboxItem) => {
    if (item.status === "completed" || item.status === "declined") {
      router.push(`/envelopes/${item.envelopeId}`);
      return;
    }
    setOpeningId(item.recipientId);
    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Not authenticated");
      }
      const access = await accessInboxItem(token, item.recipientId);
      router.push(`/inbox/sign/${encodeURIComponent(access.token)}`);
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <main className="mx-auto w-full max-w-[1440px] px-3 py-6 sm:px-5 lg:px-8 lg:py-8">
      <PageHeader description={t("description")} title={t("title")} />
      <section className="mt-7 grid gap-3 sm:grid-cols-3">
        <article className="clay-panel-soft rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">{t("actionRequired")}</p>
          <p className="mt-1 text-2xl font-semibold">{pending.length}</p>
        </article>
        <article className="clay-panel-soft rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">{t("completed")}</p>
          <p className="mt-1 text-2xl font-semibold">{completed.length}</p>
        </article>
        <article className="clay-panel-soft rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">{t("total")}</p>
          <p className="mt-1 text-2xl font-semibold">{items.length}</p>
        </article>
      </section>
      <section className="clay-panel-soft mt-5 overflow-hidden rounded-3xl">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex rounded-xl bg-surface-subtle p-1">
            {(["pending", "completed"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={cn("rounded-lg px-4 py-2 text-xs font-semibold capitalize transition", tab === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                {t(value)}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 w-full rounded-xl border bg-background ps-9 pe-3 text-sm outline-none" placeholder={t("search")} />
          </div>
        </div>
        {inboxQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 p-14 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t("loading")}
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="p-14 text-center text-sm text-muted-foreground">{t("empty")}</div>
        ) : (
          <div className="divide-y">
            {visibleItems.map((item) => (
              <article key={item.recipientId} className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_180px] lg:items-center">
                <div className="flex min-w-0 items-start gap-4">
                  <span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
                    {item.status === "completed" ? <CheckCircle2 className="size-5" /> : <FileSignature className="size-5" />}
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold sm:text-base">{item.title}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.senderName} · {item.companyName} · {item.role}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 lg:justify-end">
                  <Button onClick={() => void openItem(item)} disabled={openingId === item.recipientId}>
                    {openingId === item.recipientId ? <Loader2 className="size-4 animate-spin" /> : null}
                    {item.status === "sent" || item.status === "viewed" ? t("open") : t("view")}
                    <ArrowRight />
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
