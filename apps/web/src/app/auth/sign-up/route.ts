import { getSignUpUrl } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";

export async function GET(request: Request) {
  const email = new URL(request.url).searchParams.get("email") || undefined;
  redirect(await getSignUpUrl({ loginHint: email }));
}
