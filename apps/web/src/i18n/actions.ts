"use server";

import { cookies } from "next/headers";

import { isAppLocale, type AppLocale } from "./config";

const localeCookie = "app-locale";

export async function setAppLocale(locale: AppLocale) {
  if (!isAppLocale(locale)) {
    throw new Error("Unsupported locale");
  }

  const cookieStore = await cookies();
  cookieStore.set(localeCookie, locale, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}
