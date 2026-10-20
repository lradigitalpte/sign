import { KeyRound, ShieldCheck, Trash2 } from "lucide-react";
import { Link } from "react-router";

import { Badge, Card } from "@/components/page";
import { formatDate, formatDateTime, formatNumber, formatRelative } from "@/lib/format";
import type { WorkspacePrivacy } from "@/lib/types";

/** Support access and retention for one workspace. */
export function PrivacyCard({ privacy }: { privacy: WorkspacePrivacy }) {
  const { supportAccess: access, retention } = privacy;
  const lastRun = retention.runs[0];
  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <ShieldCheck className="size-4 text-muted-foreground" /> Data &amp; privacy
      </h2>

      <div className="mt-3 space-y-3 text-sm">
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <KeyRound className="size-3.5" /> Support access
            </span>
            {access ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {access ? (
              <>
                Documents can be opened until <span title={formatDateTime(access.expiresAt)}>{formatRelative(access.expiresAt).replace(/^in /, "")} from now</span>
                {access.grantedByName ? `, allowed by ${access.grantedByName}` : ""}.{access.note ? ` “${access.note}”` : ""}
              </>
            ) : (
              "Document contents stay private. An owner or admin can allow access in Settings → Data & privacy."
            )}
          </p>
        </div>

        <div className="border-t pt-3">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Trash2 className="size-3.5" /> Retention
            </span>
            {retention.legalHold ? <Badge tone="info">Legal hold</Badge> : retention.active ? <Badge tone="warning">Auto-delete</Badge> : <Badge>Keep forever</Badge>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {retention.legalHold
              ? "Nothing can be deleted, by retention or by request, while legal hold is on."
              : retention.active
                ? `Finished envelopes are deleted ${retention.retentionMonths} months after they finish.`
                : "Envelopes are never deleted automatically."}
            {lastRun ? ` Last run ${formatRelative(lastRun.ranAt)}: ${lastRun.error ? `failed (${lastRun.error})` : `deleted ${formatNumber(lastRun.envelopesDeleted)} ${lastRun.envelopesDeleted === 1 ? "envelope" : "envelopes"}`}.` : ""}
          </p>
        </div>
      </div>
    </Card>
  );
}

/** Red banner when the owner has asked for the workspace to be deleted. */
export function DeletionBanner({ privacy }: { privacy: WorkspacePrivacy }) {
  const request = privacy.deletion;
  if (!request) return null;
  return (
    <div role="status" className="flex flex-col gap-2 rounded-2xl border border-red-500/30 bg-red-500/5 p-4 text-sm sm:flex-row sm:items-center">
      <Trash2 className="size-4 shrink-0 text-red-600 dark:text-red-400" />
      <p className="flex-1">
        <span className="font-medium text-red-700 dark:text-red-300">
          {request.status === "failed" ? "Deletion failed and will be retried." : `Scheduled for deletion on ${formatDate(request.scheduledFor)}.`}
        </span>{" "}
        <span className="text-muted-foreground">
          Requested by {request.requestedByEmail} {formatRelative(request.createdAt)}.{request.error ? ` Error: ${request.error}` : ""}
        </span>
      </p>
      <Link to="/deletions" className="text-sm font-medium text-primary hover:underline">
        Deletion queue
      </Link>
    </div>
  );
}
