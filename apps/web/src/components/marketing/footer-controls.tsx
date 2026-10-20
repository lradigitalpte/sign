"use client";

import { ArrowUp, Check, ChevronDown, Globe2, Laptop, Moon, Sun } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useSyncExternalStore, useTransition } from "react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { setAppLocale } from "@/i18n/actions";
import { localeNames, locales, type AppLocale } from "@/i18n/config";
import { cn } from "@/lib/utils";

const themes = [
  { key: "light", icon: Sun },
  { key: "dark", icon: Moon },
  { key: "system", icon: Laptop },
] as const;

function ThemeSegment() {
  const t = useTranslations("ThemeSwitcher");
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  return (
    <div role="radiogroup" aria-label={t("theme")} className="inline-flex rounded-full bg-white/5 p-1 ring-1 ring-white/10">
      {themes.map(({ key, icon: Icon }) => {
        const active = mounted && theme === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={t(key)}
            title={t(key)}
            onClick={() => setTheme(key)}
            className={cn("grid size-8 place-items-center rounded-full transition", active ? "bg-white text-(--site-ink) shadow" : "text-white/55 hover:text-white")}
          >
            <Icon className="size-4" />
          </button>
        );
      })}
    </div>
  );
}

function LanguagePicker() {
  const t = useTranslations("LocaleSwitcher");
  const currentLocale = useLocale() as AppLocale;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const selectLocale = (locale: AppLocale) => {
    if (locale === currentLocale) return;
    startTransition(async () => {
      await setAppLocale(locale);
      router.refresh();
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("label")}
          disabled={isPending}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-white/5 px-4 text-sm text-white/80 ring-1 ring-white/10 transition hover:bg-white/10 hover:text-white disabled:opacity-60"
        >
          <Globe2 className="size-4" aria-hidden />
          {localeNames[currentLocale]}
          <ChevronDown className="size-3.5 opacity-60" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-44">
        <DropdownMenuLabel>{t("language")}</DropdownMenuLabel>
        {locales.map((locale) => (
          <DropdownMenuItem key={locale} onSelect={() => selectLocale(locale)}>
            <span className="flex-1">{localeNames[locale]}</span>
            {locale === currentLocale ? <Check aria-hidden /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function FooterControls() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <LanguagePicker />
      <ThemeSegment />
      <button
        type="button"
        aria-label="Back to top"
        title="Back to top"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="group grid size-10 place-items-center rounded-full bg-(--site-accent) text-white shadow-lg shadow-(--site-accent)/30 transition hover:bg-(--site-accent-hover)"
      >
        <ArrowUp className="size-4 transition-transform group-hover:-translate-y-0.5" />
      </button>
    </div>
  );
}
