"use client";

import { use } from "react";

import { GuidedSigningSession } from "@/components/signing/guided-signing-session";

export default function PublicGuidedSigningPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  return <GuidedSigningSession token={token} variant="public" />;
}
