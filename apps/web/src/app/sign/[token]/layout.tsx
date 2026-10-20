"use client";

import { use } from "react";

import { PreferWorkspaceSigning } from "@/components/signing/prefer-workspace-signing";
import { SigningAccessGate } from "@/components/signing/signing-access-gate";

export default function PublicSigningTokenLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  return (
    <>
      <PreferWorkspaceSigning token={token} />
      <SigningAccessGate token={token}>{children}</SigningAccessGate>
    </>
  );
}
