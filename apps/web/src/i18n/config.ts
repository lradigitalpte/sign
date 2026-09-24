export const locales = ["en", "ar", "fr", "es"] as const;

export type AppLocale = (typeof locales)[number];

export const defaultLocale: AppLocale = "en";

export const localeNames: Record<AppLocale, string> = {
  en: "English",
  ar: "العربية",
  fr: "Français",
  es: "Español",
};

export function getLocaleDirection(locale: AppLocale) {
  return locale === "ar" ? "rtl" : "ltr";
}

export function isAppLocale(value: string | undefined): value is AppLocale {
  return locales.some((locale) => locale === value);
}
