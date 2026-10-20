import { redirect } from "next/navigation";

// WorkOS AuthKit owns password resets: its hosted sign-in screen has the "Forgot password" flow
// and sends the reset email itself. Old links to this page continue there with the email prefilled.
export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  redirect(email ? `/auth/sign-in?email=${encodeURIComponent(email)}` : "/auth/sign-in");
}
