import type { Metadata } from "next";

import { AuthEntryPage, type AuthEntrySearchParams } from "@/components/auth/auth-entry-page";

export const metadata: Metadata = { title: { absolute: "Sign in · Signet" } };

export default function SignInRoute({ searchParams }: { searchParams: AuthEntrySearchParams }) {
  return <AuthEntryPage mode="signin" searchParams={searchParams} />;
}
