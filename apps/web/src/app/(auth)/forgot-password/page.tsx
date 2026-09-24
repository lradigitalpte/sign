import { ArrowLeft, Mail } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default async function ForgotPasswordPage() {
  const t = await getTranslations("Auth.forgotPassword");
  return <AuthShell description={t("description")} title={t("title")}><form className="grid gap-5"><FormField htmlFor="email" label={t("email")}><div className="relative"><Mail className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input autoComplete="email" className="ps-9" id="email" name="email" type="email" /></div></FormField><Button size="lg" type="submit">{t("submit")}</Button></form><Link className="mt-6 flex items-center justify-center gap-2 text-sm font-medium text-primary hover:underline" href="/signin"><ArrowLeft className="size-4 rtl:rotate-180" />{t("back")}</Link></AuthShell>;
}
