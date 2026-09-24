import { ArrowRight, Building2, KeyRound, Mail, UserRound } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default async function SignUpPage() {
  const t = await getTranslations("Auth.signUp");
  const fields = [{ id: "name", icon: UserRound, type: "text" }, { id: "company", icon: Building2, type: "text" }, { id: "email", icon: Mail, type: "email" }, { id: "password", icon: KeyRound, type: "password" }] as const;
  return <AuthShell description={t("description")} title={t("title")}><form className="grid gap-4">
    {fields.map(({ icon: Icon, id, type }) => <FormField htmlFor={id} key={id} label={t(id)}><div className="relative"><Icon className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input autoComplete={id === "password" ? "new-password" : id} className="ps-9" id={id} name={id} type={type} /></div></FormField>)}
    <label className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><input className="mt-0.5 size-4 shrink-0 accent-primary" name="terms" required type="checkbox" /><span>{t("terms")}</span></label>
    <Button className="mt-1" size="lg" type="submit">{t("submit")}<ArrowRight className="rtl:rotate-180" /></Button>
  </form><p className="mt-6 text-center text-sm text-muted-foreground">{t("hasAccount")} <Link className="font-semibold text-primary hover:underline" href="/signin">{t("signIn")}</Link></p></AuthShell>;
}
