import { withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";

import { SignInPage } from "@/components/ui/sign-in-flow-1";
import { safeReturnTo } from "@/lib/safe-return-to";

export type AuthEntrySearchParams = Promise<{ returnTo?: string; email?: string; auth_error?: string }>;

// Codes come from the AuthKit callback's onError handler (src/app/auth/callback/route.ts).
const AUTH_ERRORS: Record<string, string> = {
  missing_pkce_cookie: "Your sign-in session expired or was started in another tab or browser. Please try again.",
  oauth_state_mismatch: "Your sign-in session expired or was started in another tab or browser. Please try again.",
};

/** Shared server logic for /signin and /signup: skip the form when already signed in, keep returnTo, explain failures. */
export async function AuthEntryPage({ mode, searchParams }: { mode: "signin" | "signup"; searchParams: AuthEntrySearchParams }) {
  const { returnTo, email, auth_error: authError } = await searchParams;
  const destination = safeReturnTo(returnTo ?? null);

  const { user } = await withAuth();
  if (user) redirect(destination ?? "/dashboard");

  const error = authError ? (AUTH_ERRORS[authError] ?? "We couldn't complete sign-in with WorkOS. Please try again.") : undefined;

  return <SignInPage initialTab={mode} returnTo={destination} defaultEmail={email} error={error} />;
}
