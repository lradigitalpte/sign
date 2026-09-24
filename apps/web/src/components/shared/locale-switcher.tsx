"use client";

import { Check, Globe2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setAppLocale } from "@/i18n/actions";
import { localeNames, locales, type AppLocale } from "@/i18n/config";

export function LocaleSwitcher() {
  const currentLocale = useLocale() as AppLocale;
  const router = useRouter();
  const t = useTranslations("LocaleSwitcher");
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
        <Button aria-label={t("label")} disabled={isPending} size="icon" variant="ghost">
          <Globe2 aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>{t("language")}</DropdownMenuLabel>
        {locales.map((locale) => (
          <DropdownMenuItem key={locale} onSelect={() => selectLocale(locale)}>
            <span className="flex-1">{localeNames[locale]}</span>
            {locale === currentLocale ? <Check aria-hidden="true" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
