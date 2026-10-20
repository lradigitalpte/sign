import { redirect } from "next/navigation";

// Comparing document versions isn't built; this address opens the envelope.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/envelopes/${encodeURIComponent(id)}`);
}
