import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { accessInboxItem, listEnvelopeRecipients, sendEnvelope, type EnvelopeRecipient } from "@/lib/platform-api";

export function isSoloSelfSign(recipients: EnvelopeRecipient[], userEmail?: string | null) {
  if (!userEmail?.trim() || recipients.length !== 1) {
    return false;
  }
  const recipient = recipients[0];
  return recipient.role === "signer" && recipient.email.trim().toLowerCase() === userEmail.trim().toLowerCase();
}

export async function openWorkspaceSigningSession(
  accessToken: string,
  envelopeId: string,
  recipientId: string,
  router: AppRouterInstance,
) {
  await sendEnvelope(accessToken, envelopeId, crypto.randomUUID());
  const access = await accessInboxItem(accessToken, recipientId);
  router.push(`/inbox/sign/${encodeURIComponent(access.token)}?layout=1`);
}

export async function resumeSoloSelfSignIfApplicable(
  accessToken: string,
  envelopeId: string,
  userEmail: string | undefined,
  router: AppRouterInstance,
) {
  const recipients = await listEnvelopeRecipients(accessToken, envelopeId);
  if (!isSoloSelfSign(recipients, userEmail)) {
    return false;
  }
  await openWorkspaceSigningSession(accessToken, envelopeId, recipients[0].id, router);
  return true;
}
