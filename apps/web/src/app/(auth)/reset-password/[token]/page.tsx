import { KeyRound } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { AuthShell } from "@/components/auth/auth-shell";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations("Auth.resetPassword");
  return <AuthShell description={t("description")} title={t("title")}><form className="grid gap-5"><input name="token" type="hidden" value={token} /><FormField description={t("guidance")} htmlFor="password" label={t("password")}><div className="relative"><KeyRound className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input autoComplete="new-password" className="ps-9" id="password" name="password" type="password" /></div></FormField><FormField htmlFor="confirmation" label={t("confirmation")}><Input autoComplete="new-password" id="confirmation" name="confirmation" type="password" /></FormField><Button size="lg" type="submit">{t("submit")}</Button></form></AuthShell>;
}
