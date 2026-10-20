import { redirect } from "next/navigation";

// A template's roles are its recipients, set on the recipients step.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/envelopes/${encodeURIComponent(id)}/recipients`);
}
