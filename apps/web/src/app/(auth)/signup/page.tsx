import type { Metadata } from "next";

import { AuthEntryPage, type AuthEntrySearchParams } from "@/components/auth/auth-entry-page";

export const metadata: Metadata = { title: { absolute: "Create account · Signet" } };

export default function SignUpRoute({ searchParams }: { searchParams: AuthEntrySearchParams }) {
  return <AuthEntryPage mode="signup" searchParams={searchParams} />;
}
