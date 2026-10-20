import { redirect } from "next/navigation";

// Folders are created, renamed and deleted from the folder bar on the Envelopes page.
export default function FoldersPage() {
  redirect("/envelopes");
}
