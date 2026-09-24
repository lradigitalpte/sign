import { MailCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { AuthMessage } from "@/components/auth/auth-message";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";

export default async function VerifyEmailPage() {
  const t = await getTranslations("Auth.verifyEmail");
  return <AuthShell description={t("description")} title={t("title")}><AuthMessage description={t("message")} icon={MailCheck} title={t("checkInbox")} /><div className="mt-5 grid gap-2"><Button variant="outline">{t("resend")}</Button><Link className="text-center text-sm font-medium text-primary hover:underline" href="/signin">{t("back")}</Link></div></AuthShell>;
}
