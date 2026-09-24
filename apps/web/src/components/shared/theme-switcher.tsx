"use client";

import { Check, Laptop, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const options = [{ key: "light", icon: Sun }, { key: "dark", icon: Moon }, { key: "system", icon: Laptop }] as const;

export function ThemeSwitcher() {
  const t = useTranslations("ThemeSwitcher");
  const { resolvedTheme, setTheme, theme } = useTheme();
  const mounted = useSyncExternalStore(() => () => undefined, () => true, () => false);
  const Icon = mounted && resolvedTheme === "dark" ? Moon : Sun;

  return <DropdownMenu><DropdownMenuTrigger asChild><Button aria-label={t("label")} size="icon" variant="ghost"><Icon /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-40"><DropdownMenuLabel>{t("theme")}</DropdownMenuLabel>{options.map(({ icon: OptionIcon, key }) => <DropdownMenuItem key={key} onSelect={() => setTheme(key)}><OptionIcon /><span className="flex-1">{t(key)}</span>{mounted && theme === key ? <Check /> : null}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>;
}
