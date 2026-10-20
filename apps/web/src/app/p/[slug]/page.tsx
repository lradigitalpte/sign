import { notFound } from "next/navigation";

// Public organization profiles aren't built yet (Settings shows Public profile as coming soon).
export default function PublicProfilePage() {
  notFound();
}
