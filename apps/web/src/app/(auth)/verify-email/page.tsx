import { redirect } from "next/navigation";

// WorkOS AuthKit verifies email addresses inside its hosted flow (it emails a code and asks for it
// before finishing sign-in or sign-up), so there is no local step. Send visitors back into that flow.
export default function VerifyEmailPage() {
  redirect("/auth/sign-in");
}
