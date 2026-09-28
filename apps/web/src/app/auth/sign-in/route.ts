import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";

import { safeReturnTo } from "@/lib/safe-return-to";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const email = params.get("email") || undefined;
  redirect(await getSignInUrl({ loginHint: email, returnTo: safeReturnTo(params.get("returnTo")) }));
}
