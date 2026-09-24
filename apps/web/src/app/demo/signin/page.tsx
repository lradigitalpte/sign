import { SignInPage } from "@/components/ui/sign-in-flow-1";

/**
 * Standalone demo of the immersive sign-in flow.
 * Visit: http://localhost:3000/demo/signin
 */
export default function SignInDemoPage() {
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <SignInPage />
    </div>
  );
}
