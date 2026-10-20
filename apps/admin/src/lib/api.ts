import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@workos-inc/authkit-react";
import { useCallback } from "react";

import type { AccountDeletionRequest, Admin, Announcement, AuditEntry, BillingOverview, DeletionRequest, PlanPrice, EmailJob, FeatureFlag, WebhookEvent, WorkspaceUsage, EmailJobDetail, EmailJobList, EnvelopeDetail, EnvelopeSummary, List, Stats, SystemHealth, UserDetail, UserSummary, WorkspaceDetail, WorkspaceSummary } from "@/lib/types";

export const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8085";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** Fetch helper for /admin/v1 that attaches the WorkOS access token. */
export function useAdminFetch() {
  const { getAccessToken } = useAuth();
  return useCallback(
    async <T>(path: string, init?: RequestInit): Promise<T> => {
      const token = await getAccessToken();
      const response = await fetch(`${apiUrl}/admin/v1${path}`, {
        ...init,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          ...(init?.body ? { "Content-Type": "application/json" } : {}),
          ...init?.headers,
        },
      });
      const body = (await response.json().catch(() => null)) as { code?: string; error?: string } | null;
      if (!response.ok) throw new ApiError(response.status, body?.code ?? "error", body?.error ?? response.statusText);
      return body as T;
    },
    [getAccessToken],
  );
}

export type ListParams = { query?: string; status?: string; page?: number; pageSize?: number; workspaceId?: string; kind?: string; targetType?: string; targetId?: string; adminId?: string; plan?: string };

function toSearch(params: ListParams) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export function useMe(enabled: boolean) {
  const adminFetch = useAdminFetch();
  return useQuery({ queryKey: ["me"], queryFn: () => adminFetch<Admin>("/me"), enabled, retry: false, staleTime: 5 * 60_000 });
}

export function useStats(days: number) {
  const adminFetch = useAdminFetch();
  return useQuery({
    queryKey: ["stats", days],
    queryFn: () => adminFetch<Stats>(`/stats?days=${days}`),
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useSystemHealth() {
  const adminFetch = useAdminFetch();
  return useQuery({
    queryKey: ["system"],
    queryFn: () => adminFetch<SystemHealth>("/system"),
    refetchInterval: 15_000,
    staleTime: 0,
    placeholderData: keepPreviousData,
  });
}

export function useWorkspaces(params: ListParams) {
  const adminFetch = useAdminFetch();
  return useQuery({
    queryKey: ["workspaces", params],
    queryFn: () => adminFetch<List<WorkspaceSummary>>(`/workspaces${toSearch(params)}`),
    placeholderData: keepPreviousData,
  });
}

export function useWorkspace(id: string) {
  const adminFetch = useAdminFetch();
  return useQuery({ queryKey: ["workspace", id], queryFn: () => adminFetch<WorkspaceDetail>(`/workspaces/${encodeURIComponent(id)}`) });
}

export function useUsers(params: ListParams) {
  const adminFetch = useAdminFetch();
  return useQuery({
    queryKey: ["users", params],
    queryFn: () => adminFetch<List<UserSummary>>(`/users${toSearch(params)}`),
    placeholderData: keepPreviousData,
  });
}

export function useUser(id: string) {
  const adminFetch = useAdminFetch();
  return useQuery({ queryKey: ["user", id], queryFn: () => adminFetch<UserDetail>(`/users/${encodeURIComponent(id)}`) });
}

export function useAdmins() {
  const adminFetch = useAdminFetch();
  return useQuery({ queryKey: ["admins"], queryFn: () => adminFetch<Admin[]>("/admins") });
}

export function useEnvelopes(params: ListParams) {
  const adminFetch = useAdminFetch();
  return useQuery({
    queryKey: ["envelopes", params],
    queryFn: () => adminFetch<List<EnvelopeSummary>>(`/envelopes${toSearch(params)}`),
    placeholderData: keepPreviousData,
  });
}

export function useEnvelope(id: string) {
  const adminFetch = useAdminFetch();
  return useQuery({ queryKey: ["envelope", id], queryFn: () => adminFetch<EnvelopeDetail>(`/envelopes/${encodeURIComponent(id)}`) });
}

export type EnvelopeAction =
  | { kind: "resend"; reason: string }
  | { kind: "extend"; reason: string; expiresAt: string }
  | { kind: "void"; reason: string };

export type EnvelopeActionResult = { remindersQueued?: number; expiresAt?: string; reopened?: boolean; ok?: boolean };

/** Resend, extend or void an envelope, then refresh everything that shows it. */
export function useEnvelopeAction(id: string) {
  const adminFetch = useAdminFetch();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, ...body }: EnvelopeAction) =>
      adminFetch<EnvelopeActionResult>(`/envelopes/${encodeURIComponent(id)}/${kind}`, { method: "POST", body: JSON.stringify(body) }),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["envelope", id] }),
        queryClient.invalidateQueries({ queryKey: ["envelopes"] }),
        queryClient.invalidateQueries({ queryKey: ["stats"] }),
      ]),
  });
}

export function useEmailJobs(params: ListParams) {
  const adminFetch = useAdminFetch();
  return useQuery({
    queryKey: ["jobs", params],
    queryFn: () => adminFetch<EmailJobList>(`/jobs${toSearch(params)}`),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  });
}

export function useEmailJob(id: string | null) {
  const adminFetch = useAdminFetch();
  return useQuery({
    queryKey: ["job", id],
    queryFn: () => adminFetch<EmailJobDetail>(`/jobs/${encodeURIComponent(id ?? "")}`),
    enabled: Boolean(id),
  });
}

/** Retry one email (id) or every email that gave up or got stuck (no id). */
export function useRetryEmails() {
  const adminFetch = useAdminFetch();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id?: string; reason: string }) =>
      adminFetch<EmailJob | { retried: number; skipped: number }>(id ? `/jobs/${encodeURIComponent(id)}/retry` : "/jobs/retry", {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onSettled: () =>
      Promise.all(["jobs", "job", "stats", "envelope"].map((key) => queryClient.invalidateQueries({ queryKey: [key] }))),
  });
}

export function useAudit(params: ListParams) {
  const adminFetch = useAdminFetch();
  return useQuery({
    queryKey: ["audit", params],
    queryFn: () => adminFetch<List<AuditEntry>>(`/audit${toSearch(params)}`),
    placeholderData: keepPreviousData,
  });
}

export type AdminRequest = { method: "POST" | "PUT" | "PATCH" | "DELETE"; path: string; body?: Record<string, unknown> };

/** Any admin write. Afterwards every cached query is refreshed, since one change can show up on many pages. */
export function useAdminAction<T = unknown>() {
  const adminFetch = useAdminFetch();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ method, path, body }: AdminRequest) => adminFetch<T>(path, { method, body: JSON.stringify(body ?? {}) }),
    onSettled: () => queryClient.invalidateQueries(),
  });
}

export function useWorkspaceUsage(id: string) {
  const adminFetch = useAdminFetch();
  return useQuery({ queryKey: ["workspace-usage", id], queryFn: () => adminFetch<WorkspaceUsage>(`/workspaces/${encodeURIComponent(id)}/usage`) });
}

export function useWorkspaceFlags(id: string) {
  const adminFetch = useAdminFetch();
  return useQuery({ queryKey: ["workspace-flags", id], queryFn: () => adminFetch<Record<string, boolean>>(`/workspaces/${encodeURIComponent(id)}/flags`) });
}

export function useFlags() {
  const adminFetch = useAdminFetch();
  return useQuery({ queryKey: ["flags"], queryFn: () => adminFetch<FeatureFlag[]>("/flags") });
}

export function useWebhookEvents(params: ListParams) {
  const adminFetch = useAdminFetch();
  return useQuery({
    queryKey: ["webhooks", params],
    queryFn: () => adminFetch<List<WebhookEvent>>(`/webhooks${toSearch(params)}`),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
}

export function useWebhookEvent(id: string | null) {
  const adminFetch = useAdminFetch();
  return useQuery({ queryKey: ["webhook", id], queryFn: () => adminFetch<WebhookEvent>(`/webhooks/${encodeURIComponent(id ?? "")}`), enabled: Boolean(id) });
}

export function useAccountDeletions(params: ListParams) {
  const adminFetch = useAdminFetch();
  return useQuery({
    queryKey: ["account-deletions", params],
    queryFn: () => adminFetch<List<AccountDeletionRequest>>(`/account-deletions${toSearch(params)}`),
    placeholderData: keepPreviousData,
  });
}

export function useDeletions(params: ListParams) {
  const adminFetch = useAdminFetch();
  return useQuery({
    queryKey: ["deletions", params],
    queryFn: () => adminFetch<List<DeletionRequest>>(`/deletions${toSearch(params)}`),
    placeholderData: keepPreviousData,
  });
}

export function useAnnouncements() {
  const adminFetch = useAdminFetch();
  return useQuery({ queryKey: ["announcements"], queryFn: () => adminFetch<Announcement[]>("/announcements") });
}

/**
 * Opens a document in a new tab. Only works while the workspace has support access on; each view is
 * logged for the customer. The tab opens straight away (so pop-up blockers allow it) and fills once loaded.
 */
export function useOpenDocument() {
  const { getAccessToken } = useAuth();
  const queryClient = useQueryClient();
  return useCallback(
    async (envelopeId: string, documentId: string, signed: boolean) => {
      const tab = window.open("", "_blank");
      try {
        const token = await getAccessToken();
        const response = await fetch(`${apiUrl}/admin/v1/envelopes/${encodeURIComponent(envelopeId)}/documents/${encodeURIComponent(documentId)}/file${signed ? "?version=signed" : ""}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? response.statusText);
        }
        const url = URL.createObjectURL(await response.blob());
        if (tab) tab.location.href = url;
        else window.location.href = url;
        void queryClient.invalidateQueries({ queryKey: ["envelope", envelopeId] });
      } catch (error) {
        tab?.close();
        throw error;
      }
    },
    [getAccessToken, queryClient],
  );
}

export function useBillingOverview() {
  const adminFetch = useAdminFetch();
  return useQuery({ queryKey: ["billing"], queryFn: () => adminFetch<BillingOverview>("/billing"), refetchInterval: 60_000 });
}

/** List prices per paid plan. */
export function usePlanPrices() {
  const adminFetch = useAdminFetch();
  return useQuery({ queryKey: ["plan-prices"], queryFn: () => adminFetch<PlanPrice[]>("/plans"), staleTime: 60_000 });
}
