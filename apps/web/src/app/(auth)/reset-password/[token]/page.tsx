import { redirect } from "next/navigation";

// Password reset links from WorkOS open AuthKit's own reset screen, so this route has nothing to
// complete locally. Anyone who lands here is sent to sign in, where AuthKit can start a new reset.
export default function ResetPasswordPage() {
  redirect("/auth/sign-in");
}
