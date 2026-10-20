import { redirect } from "next/navigation";

// Templates are edited in the envelope editor, like any draft.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/envelopes/${encodeURIComponent(id)}/editor`);
}
