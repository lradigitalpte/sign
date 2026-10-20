import { redirect } from "next/navigation";

// An envelope's signer passcode and session timeout are set in Document settings in the editor.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/envelopes/${encodeURIComponent(id)}/editor`);
}
