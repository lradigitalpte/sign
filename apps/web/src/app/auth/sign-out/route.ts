import { signOut } from "@workos-inc/authkit-nextjs";

// Always open this route with a full page navigation (<a href>), never next/link: it redirects to
// WorkOS, and a client-side RSC fetch of that redirect is blocked by CORS.
export async function GET(request: Request) {
  // WorkOS needs an absolute return URL; it must also be listed as a sign-out redirect in the WorkOS dashboard.
  return signOut({ returnTo: new URL("/signin", request.url).toString() });
}
