import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_Arabic } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { getLocaleDirection, isAppLocale } from "@/i18n/config";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const notoSansArabic = Noto_Sans_Arabic({ subsets: ["arabic"], variable: "--font-noto-arabic" });

export const metadata: Metadata = {
  title: {
    default: "Signing Workspace",
    template: "%s | Signing Workspace",
  },
  description: "Prepare, send, and securely sign business documents.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const messages = await getMessages();
  const direction = getLocaleDirection(isAppLocale(locale) ? locale : "en");

  return (
    <html dir={direction} lang={locale} className={`${geistSans.variable} ${geistMono.variable} ${notoSansArabic.variable} h-full font-sans antialiased`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
