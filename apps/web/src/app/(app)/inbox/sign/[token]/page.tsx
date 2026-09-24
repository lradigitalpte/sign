"use client";

import { use } from "react";

import { GuidedSigningSession } from "@/components/signing/guided-signing-session";

export default function WorkspaceSigningPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ layout?: string }>;
}) {
  const { token } = use(params);
  const { layout } = use(searchParams);
  return <GuidedSigningSession token={token} variant="workspace" layoutMode={layout !== "0"} />;
}
