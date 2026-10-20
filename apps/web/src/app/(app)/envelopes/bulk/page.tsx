import { ComingSoon } from "@/components/shared/unavailable-feature";

// Bulk move, delete and void work from the Envelopes list. Bulk send from a spreadsheet is on the roadmap.
export default function BulkSendPage() {
  return <ComingSoon title="Bulk send" description="Send one document to many people at once, each with their own copy, from a CSV list." backHref="/envelopes" backLabel="Back to envelopes" />;
}
