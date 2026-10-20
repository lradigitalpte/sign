import { Flag } from "lucide-react";
import { Link } from "react-router";

import { ActivityChart, Legend } from "@/components/activity-chart";
import { Badge, Card, CardHeader, ErrorState, Loading } from "@/components/page";
import { useWorkspaceFlags, useWorkspaceUsage } from "@/lib/api";
import { formatBytes, formatNumber } from "@/lib/format";

function Figure({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="px-5 py-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

/** Sending activity per week for the last 12 weeks, plus this month's volume and storage. */
export function UsageCard({ workspaceId }: { workspaceId: string }) {
  const usage = useWorkspaceUsage(workspaceId);
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Usage" description="Envelopes sent and completed per week, last 12 weeks" actions={<Legend />} />
      {usage.isPending ? (
        <Loading />
      ) : usage.error ? (
        <ErrorState error={usage.error} onRetry={() => void usage.refetch()} />
      ) : (
        <>
          <div className="px-5 pt-4 pb-2">
            <ActivityChart data={usage.data.weeks.map((w) => ({ date: w.week, sent: w.sent, completed: w.completed }))} unit="week" />
          </div>
          <div className="grid grid-cols-1 divide-y border-t sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <Figure label="Sent this month" value={formatNumber(usage.data.sentThisMonth)} hint="Since the 1st, UTC" />
            <Figure label="Active senders" value={formatNumber(usage.data.activeSenders)} hint="Sent something in 30 days" />
            <Figure label="Storage" value={formatBytes(usage.data.storageBytes)} hint={`${formatNumber(usage.data.documentsCount)} uploaded ${usage.data.documentsCount === 1 ? "file" : "files"}`} />
          </div>
        </>
      )}
    </Card>
  );
}

/** Which feature flags are on for this workspace; overrides are managed on the Feature flags page. */
export function WorkspaceFlagsCard({ workspaceId }: { workspaceId: string }) {
  const flags = useWorkspaceFlags(workspaceId);
  const entries = Object.entries(flags.data ?? {}).sort(([a], [b]) => a.localeCompare(b));
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <Flag className="size-4 text-muted-foreground" /> Feature flags
        </h2>
        <Link to="/flags" className="text-xs font-medium text-primary hover:underline">
          Manage
        </Link>
      </div>
      {flags.isPending ? null : entries.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No flags exist yet.</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {entries.map(([key, enabled]) => (
            <li key={key} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate font-mono text-xs">{key}</span>
              <Badge tone={enabled ? "success" : "neutral"}>{enabled ? "On" : "Off"}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
