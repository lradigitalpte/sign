import { handleAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";

export const GET = handleAuth({
  returnPathname: "/dashboard",
  // Instead of AuthKit's bare 500 page, log why sign-in failed and send the user back to try again.
  // Common codes: missing_pkce_cookie (sign-in started on another domain, or the callback URL was
  // reopened) and oauth_state_mismatch. Errors without a code usually come from WorkOS rejecting
  // the code exchange (wrong WORKOS_API_KEY / WORKOS_CLIENT_ID, or a code that was already used).
  onError: ({ error, request }) => {
    const code = (error as { code?: string } | undefined)?.code ?? "code_exchange_failed";
    console.error("[auth callback] sign-in failed", { code, message: error instanceof Error ? error.message : String(error) });
    return NextResponse.redirect(new URL(`/signin?auth_error=${encodeURIComponent(code)}`, request.url));
  },
});
