"use client";

import { useAccessToken } from "@workos-inc/authkit-nextjs/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  allowSupportAccess,
  addGroupMember,
  createMemberGroup,
  deleteMemberGroup,
  listGroupDirectory,
  listGroupMembers,
  listTeamGroups,
  removeGroupMember,
  removeTeamGroup,
  setTeamGroup,
  updateMemberGroup,
  getTeamSettings,
  updateTeamSettings,
  type TeamSettingsSection,
  type WorkspaceSettings,
  deleteTeam,
  listTeamMembers,
  listTeamsWithPermissions,
  removeTeamMember,
  renameTeam,
  setTeamMember,
  getWorkspaceOverview,
  renameWorkspace,
  getEntitlements,
  getAccountSecurity,
  getBillingDetails,
  openBillingPortal,
  revokeOtherSessions,
  revokeSession,
  sendPasswordReset,
  startCheckout,
  type CheckoutInput,
  cancelAccountDeletion,
  cancelWorkspaceDeletion,
  downloadWorkspaceExport,
  getAccountDeletion,
  getEnvelope,
  getFeatureFlags,
  getSupportAccess,
  getWorkspaceDeletion,
  listAnnouncements,
  requestAccountDeletion,
  requestWorkspaceDeletion,
  revokeSupportAccess,
  getEnvelopeReview,
  getMe,
  getSubscription,
  listEnvelopeAudit,
  listEnvelopeAttachments,
  listEnvelopeDocuments,
  listEnvelopeFields,
  getSignaturePreferences,
  getWorkspaceSettings,
  getWorkspaceStorage,
  listEnvelopeRecipients,
  listEnvelopes,
  listFolders,
  listInbox,
  listInvitations,
  listMembers,
  listSecuredPDFs,
  listWorkspaces,
  updateProfile,
  updateWorkspaceSettings,
  updateWorkspaceStorage,
  testWorkspaceStorage,
  disconnectWorkspaceStorage,
  listTeams, createTeam, listGroups, createGroup,
} from "@/lib/platform-api";

export function usePlatformToken() {
  const { getAccessToken, loading } = useAccessToken();
  return { getAccessToken, loading };
}

export function useTeams(){const {getAccessToken,loading}=usePlatformToken();return useQuery({queryKey:["teams"],enabled:!loading,queryFn:async()=>{const token=await getAccessToken();if(!token)throw new Error("Not authenticated");return listTeams(token)}})}
export function useCreateTeam(){const {getAccessToken}=usePlatformToken();const q=useQueryClient();return useMutation({mutationFn:async(name:string)=>{const token=await getAccessToken();if(!token)throw new Error("Not authenticated");return createTeam(token,name)},onSuccess:()=>q.invalidateQueries({queryKey:["teams"]})})}
export function useGroups(){const {getAccessToken,loading}=usePlatformToken();return useQuery({queryKey:["groups"],enabled:!loading,queryFn:async()=>{const token=await getAccessToken();if(!token)throw new Error("Not authenticated");return listGroups(token)}})}
export function useCreateGroup(){const {getAccessToken}=usePlatformToken();const q=useQueryClient();return useMutation({mutationFn:async(input:{name:string;description:string})=>{const token=await getAccessToken();if(!token)throw new Error("Not authenticated");return createGroup(token,input.name,input.description)},onSuccess:()=>q.invalidateQueries({queryKey:["groups"]})})}

export function useEnvelopes(folderId?: string) {
  const { getAccessToken, loading } = usePlatformToken();
  return useQuery({
    queryKey: ["envelopes", folderId ?? "all"],
    enabled: !loading,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Not authenticated");
      }
      return listEnvelopes(token, folderId ? { folderId } : undefined);
    },
  });
}

export function useTemplates() {
  const { getAccessToken, loading } = usePlatformToken();
  return useQuery({
    queryKey: ["envelopes", "templates"],
    enabled: !loading,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Not authenticated");
      }
      return listEnvelopes(token, { type: "template" });
    },
  });
}

export function useFolders() {
  const { getAccessToken, loading } = usePlatformToken();
  return useQuery({
    queryKey: ["folders"],
    enabled: !loading,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Not authenticated");
      }
      return listFolders(token);
    },
  });
}

export function useEnvelopeReview(envelopeId: string) {
  const { getAccessToken, loading } = usePlatformToken();
  return useQuery({
    queryKey: ["envelope-review", envelopeId],
    enabled: Boolean(envelopeId) && !loading,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Not authenticated");
      }
      return getEnvelopeReview(token, envelopeId);
    },
  });
}

export function useEnvelope(envelopeId: string) {
  const { getAccessToken, loading } = usePlatformToken();
  return useQuery({
    queryKey: ["envelope", envelopeId],
    enabled: Boolean(envelopeId) && !loading,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Not authenticated");
      }
      return getEnvelope(token, envelopeId);
    },
  });
}

export function useEnvelopeRecipients(envelopeId: string) {
  const { getAccessToken, loading } = usePlatformToken();
  return useQuery({
    queryKey: ["envelope-recipients", envelopeId],
    enabled: Boolean(envelopeId) && !loading,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Not authenticated");
      }
      return listEnvelopeRecipients(token, envelopeId);
    },
  });
}

export function useEnvelopeAttachments(envelopeId: string) {
  const { getAccessToken, loading } = usePlatformToken();
  return useQuery({
    queryKey: ["envelope-attachments", envelopeId],
    enabled: Boolean(envelopeId) && !loading,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Not authenticated");
      }
      return listEnvelopeAttachments(token, envelopeId);
    },
  });
}

export function useEnvelopeFields(envelopeId: string) {
  const { getAccessToken, loading } = usePlatformToken();
  return useQuery({
    queryKey: ["envelope-fields", envelopeId],
    enabled: Boolean(envelopeId) && !loading,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Not authenticated");
      }
      return listEnvelopeFields(token, envelopeId);
    },
  });
}

export function useMe() {
  const { getAccessToken, loading } = usePlatformToken();
  return useQuery({
    queryKey: ["me"],
    enabled: !loading,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Not authenticated");
      }
      return getMe(token);
    },
  });
}

export function useUpdateProfile() {
  const { getAccessToken } = usePlatformToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; avatarDataUrl: string | null }) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      return updateProfile(token, input);
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["me"], (current: { user: typeof user; workspace: unknown } | undefined) =>
        current ? { ...current, user } : current,
      );
    },
  });
}

export function useWorkspaceSettings(section: string) {
  const { getAccessToken, loading } = usePlatformToken();
  return useQuery({
    queryKey: ["workspace-settings", section],
    enabled: Boolean(section) && !loading,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      return getWorkspaceSettings(token, section);
    },
  });
}

export function useUpdateWorkspaceSettings(section: string) {
  const { getAccessToken } = usePlatformToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (config: import("@/lib/platform-api").WorkspaceSettings) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      return updateWorkspaceSettings(token, section, config);
    },
    onSuccess: (config) => queryClient.setQueryData(["workspace-settings", section], config),
  });
}

export function useWorkspaceStorage() {
  const { getAccessToken, loading } = usePlatformToken();
  return useQuery({
    queryKey: ["workspace-storage"],
    enabled: !loading,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      return getWorkspaceStorage(token);
    },
  });
}

export function useUpdateWorkspaceStorage() {
  const { getAccessToken } = usePlatformToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: import("@/lib/platform-api").WorkspaceStorageInput) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      return updateWorkspaceStorage(token, input);
    },
    onSuccess: (config) => queryClient.setQueryData(["workspace-storage"], config),
  });
}

export function useTestWorkspaceStorage() {
  const { getAccessToken } = usePlatformToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input?: import("@/lib/platform-api").WorkspaceStorageInput) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      return testWorkspaceStorage(token, input);
    },
    onSuccess: (config) => queryClient.setQueryData(["workspace-storage"], config),
  });
}

export function useDisconnectWorkspaceStorage() {
  const { getAccessToken } = usePlatformToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      return disconnectWorkspaceStorage(token);
    },
    onSuccess: (config) => queryClient.setQueryData(["workspace-storage"], config),
  });
}

export function useSignaturePreferences() {
  const { getAccessToken, loading } = usePlatformToken();
  return useQuery({
    queryKey: ["signature-preferences"],
    enabled: !loading,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) {
        return {};
      }
      return getSignaturePreferences(token);
    },
  });
}

export function useInbox() {
  const { getAccessToken, loading } = usePlatformToken();
  return useQuery({
    queryKey: ["inbox"],
    enabled: !loading,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Not authenticated");
      }
      return listInbox(token);
    },
  });
}

function useAuthedQuery<T>(key: unknown[], load: (token: string) => Promise<T>, { enabled = true, ...options }: { enabled?: boolean; staleTime?: number; refetchInterval?: number } = {}) {
  const { getAccessToken, loading } = usePlatformToken();
  return useQuery({
    queryKey: key,
    enabled: !loading && enabled,
    ...options,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      return load(token);
    },
  });
}

function useAuthedMutation<I, T>(run: (token: string, input: I) => Promise<T>, invalidate: unknown[][]) {
  const { getAccessToken } = usePlatformToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: I) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      return run(token, input);
    },
    onSettled: () => Promise.all(invalidate.map((queryKey) => queryClient.invalidateQueries({ queryKey }))),
  });
}

export function useAnnouncements() {
  return useAuthedQuery(["announcements"], listAnnouncements, { staleTime: 5 * 60_000, refetchInterval: 10 * 60_000 });
}

/** Owners and admins only; pass enabled=false for everyone else. */
export function useSupportAccess(enabled = true) {
  return useAuthedQuery(["support-access"], getSupportAccess, { enabled });
}

export function useAllowSupportAccess() {
  return useAuthedMutation((token, input: { hours: number; note: string }) => allowSupportAccess(token, input.hours, input.note), [["support-access"]]);
}

export function useRevokeSupportAccess() {
  return useAuthedMutation<void, { ok: boolean }>((token) => revokeSupportAccess(token), [["support-access"]]);
}

export function useWorkspaceDeletion() {
  return useAuthedQuery(["workspace-deletion"], getWorkspaceDeletion, { staleTime: 60_000 });
}

export function useRequestWorkspaceDeletion() {
  return useAuthedMutation((token, confirmName: string) => requestWorkspaceDeletion(token, confirmName), [["workspace-deletion"]]);
}

export function useCancelWorkspaceDeletion() {
  return useAuthedMutation<void, unknown>((token) => cancelWorkspaceDeletion(token), [["workspace-deletion"]]);
}

export function useAccountDeletion() {
  return useAuthedQuery(["account-deletion"], getAccountDeletion, { staleTime: 60_000 });
}

export function useRequestAccountDeletion() {
  return useAuthedMutation((token, confirmEmail: string) => requestAccountDeletion(token, confirmEmail), [["account-deletion"]]);
}

export function useCancelAccountDeletion() {
  return useAuthedMutation<void, unknown>((token) => cancelAccountDeletion(token), [["account-deletion"]]);
}

export function useExportWorkspace() {
  return useAuthedMutation<void, void>((token) => downloadWorkspaceExport(token), []);
}

export function useSubscription() {
  const { getAccessToken, loading } = usePlatformToken();
  return useQuery({
    queryKey: ["subscription"],
    enabled: !loading,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Not authenticated");
      }
      return getSubscription(token);
    },
  });
}

/** Whether a feature flag is on for the current workspace. Off while loading and for unknown flags. */
export function useFeature(key: string) {
  const { getAccessToken, loading } = usePlatformToken();
  const flags = useQuery({
    queryKey: ["feature-flags"],
    enabled: !loading,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Not authenticated");
      }
      return getFeatureFlags(token);
    },
  });
  return flags.data?.[key] === true;
}

export function useMembers() {
  const { getAccessToken, loading } = usePlatformToken();
  return useQuery({
    queryKey: ["members"],
    enabled: !loading,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Not authenticated");
      }
      return listMembers(token);
    },
  });
}

export function useWorkspaces() {
  const { getAccessToken, loading } = usePlatformToken();
  return useQuery({
    queryKey: ["workspaces"],
    enabled: !loading,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Not authenticated");
      }
      return listWorkspaces(token);
    },
  });
}

/** Pending invitations are only visible to owners and admins, so pass `enabled` from the caller's role. */
export function useInvitations(enabled = true) {
  const { getAccessToken, loading } = usePlatformToken();
  return useQuery({
    queryKey: ["members-invitations"],
    enabled: !loading && enabled,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Not authenticated");
      }
      return listInvitations(token);
    },
  });
}

export function useSecuredPDFs() {
  const { getAccessToken, loading } = usePlatformToken();
  return useQuery({
    queryKey: ["secured-pdfs"],
    enabled: !loading,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      return listSecuredPDFs(token);
    },
  });
}

export function useEnvelopeAudit(envelopeId: string) {
  const { getAccessToken, loading } = usePlatformToken();
  return useQuery({
    queryKey: ["envelope-audit", envelopeId],
    enabled: Boolean(envelopeId) && !loading,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Not authenticated");
      }
      return listEnvelopeAudit(token, envelopeId);
    },
  });
}

export function useEnvelopeDocuments(envelopeId: string) {
  const { getAccessToken, loading } = usePlatformToken();
  return useQuery({
    queryKey: ["envelope-documents", envelopeId],
    enabled: Boolean(envelopeId) && !loading,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Not authenticated");
      }
      return listEnvelopeDocuments(token, envelopeId);
    },
  });
}

// ---- Billing (Stripe) and account security ----

/** Runs an API call with the signed-in user's token. */
function useTokenCall() {
  const { getAccessToken } = usePlatformToken();
  return async <T,>(call: (token: string) => Promise<T>) => {
    const token = await getAccessToken();
    if (!token) throw new Error("Not authenticated");
    return call(token);
  };
}

export function useBillingDetails() {
  const { loading } = usePlatformToken();
  const withToken = useTokenCall();
  return useQuery({ queryKey: ["billing-details"], enabled: !loading, queryFn: () => withToken(getBillingDetails), retry: 1 });
}

export function useStartCheckout() {
  const withToken = useTokenCall();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CheckoutInput) => withToken((token) => startCheckout(token, input)),
    onSuccess: (result) => {
      if (result.updated) void Promise.all(["subscription", "billing-details", "entitlements"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
    },
  });
}

export function useBillingPortal() {
  const withToken = useTokenCall();
  return useMutation({ mutationFn: () => withToken(openBillingPortal) });
}

export function useAccountSecurity() {
  const { loading } = usePlatformToken();
  const withToken = useTokenCall();
  return useQuery({ queryKey: ["account-security"], enabled: !loading, queryFn: () => withToken(getAccountSecurity), retry: 1 });
}

export function useRevokeSession() {
  const withToken = useTokenCall();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => withToken((token) => revokeSession(token, sessionId)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["account-security"] }),
  });
}

export function useRevokeOtherSessions() {
  const withToken = useTokenCall();
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: () => withToken(revokeOtherSessions), onSettled: () => queryClient.invalidateQueries({ queryKey: ["account-security"] }) });
}

export function useSendPasswordReset() {
  const withToken = useTokenCall();
  return useMutation({ mutationFn: () => withToken(sendPasswordReset) });
}

/** What the workspace's plan allows, and how much of it is used (sends this month, seats). */
export function useEntitlements() {
  const { loading } = usePlatformToken();
  const withToken = useTokenCall();
  return useQuery({ queryKey: ["entitlements"], enabled: !loading, queryFn: () => withToken(getEntitlements) });
}

export function useWorkspaceOverview() {
  const { loading } = usePlatformToken();
  const withToken = useTokenCall();
  return useQuery({ queryKey: ["workspace-overview"], enabled: !loading, queryFn: () => withToken(getWorkspaceOverview) });
}

/** Renames the current workspace; the name shows everywhere (switcher, sidebar) after it saves. */
export function useRenameWorkspace() {
  const withToken = useTokenCall();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => withToken((token) => renameWorkspace(token, name)),
    onSuccess: () => Promise.all(["workspace-overview", "me", "workspaces"].map((key) => queryClient.invalidateQueries({ queryKey: [key] }))),
  });
}

// ---- Teams ----

/** Teams the user can use, and whether they may create more (workspace owners and admins). */
export function useTeamDirectory() {
  const { loading } = usePlatformToken();
  const withToken = useTokenCall();
  return useQuery({ queryKey: ["teams", "directory"], enabled: !loading, queryFn: () => withToken(listTeamsWithPermissions) });
}

export function useTeamMembers(teamId: string | null) {
  const { loading } = usePlatformToken();
  const withToken = useTokenCall();
  return useQuery({ queryKey: ["team-members", teamId], enabled: !loading && Boolean(teamId), queryFn: () => withToken((token) => listTeamMembers(token, teamId ?? "")) });
}

function useTeamMutation<T, V>(call: (token: string, variables: V) => Promise<T>) {
  const withToken = useTokenCall();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: V) => withToken((token) => call(token, variables)),
    onSettled: () => Promise.all(["teams", "team-members", "me"].map((key) => queryClient.invalidateQueries({ queryKey: [key] }))),
  });
}

export const useRenameTeam = () => useTeamMutation((token, v: { id: string; name: string }) => renameTeam(token, v.id, v.name));
export const useDeleteTeam = () => useTeamMutation((token, id: string) => deleteTeam(token, id));
export const useSetTeamMember = () => useTeamMutation((token, v: { teamId: string; userId: string; role: "admin" | "member" }) => setTeamMember(token, v.teamId, v.userId, v.role));
export const useRemoveTeamMember = () => useTeamMutation((token, v: { teamId: string; userId: string }) => removeTeamMember(token, v.teamId, v.userId));

// ---- Team settings ----

export function useTeamSettings(section: TeamSettingsSection, enabled: boolean) {
  const { loading } = usePlatformToken();
  const withToken = useTokenCall();
  return useQuery({ queryKey: ["team-settings", section], enabled: enabled && !loading, queryFn: () => withToken((token) => getTeamSettings(token, section)) });
}

export function useUpdateTeamSettings(section: TeamSettingsSection) {
  const withToken = useTokenCall();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (overrides: WorkspaceSettings | null) => withToken((token) => updateTeamSettings(token, section, overrides)),
    onSuccess: (view) => queryClient.setQueryData(["team-settings", section], view),
  });
}

// ---- Member groups ----

export function useGroupDirectory() {
  const { loading } = usePlatformToken();
  const withToken = useTokenCall();
  return useQuery({ queryKey: ["groups", "directory"], enabled: !loading, queryFn: () => withToken(listGroupDirectory) });
}

export function useGroupMembers(groupId: string | null) {
  const { loading } = usePlatformToken();
  const withToken = useTokenCall();
  return useQuery({ queryKey: ["group-members", groupId], enabled: !loading && Boolean(groupId), queryFn: () => withToken((token) => listGroupMembers(token, groupId ?? "")) });
}

export function useTeamGroups(teamId: string | null) {
  const { loading } = usePlatformToken();
  const withToken = useTokenCall();
  return useQuery({ queryKey: ["team-groups", teamId], enabled: !loading && Boolean(teamId), queryFn: () => withToken((token) => listTeamGroups(token, teamId ?? "")) });
}

/** Any change to groups can change who's on which team, so team and group queries all refresh. */
function useGroupMutation<T, V>(call: (token: string, variables: V) => Promise<T>) {
  const withToken = useTokenCall();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: V) => withToken((token) => call(token, variables)),
    onSettled: () => Promise.all(["groups", "group-members", "teams", "team-groups", "team-members", "me"].map((key) => queryClient.invalidateQueries({ queryKey: [key] }))),
  });
}

export const useCreateMemberGroup = () => useGroupMutation((token, v: { name: string; description: string }) => createMemberGroup(token, v.name, v.description));
export const useUpdateMemberGroup = () => useGroupMutation((token, v: { id: string; name?: string; description?: string }) => updateMemberGroup(token, v.id, { name: v.name, description: v.description }));
export const useDeleteMemberGroup = () => useGroupMutation((token, id: string) => deleteMemberGroup(token, id));
export const useAddGroupMember = () => useGroupMutation((token, v: { groupId: string; userId: string }) => addGroupMember(token, v.groupId, v.userId));
export const useRemoveGroupMember = () => useGroupMutation((token, v: { groupId: string; userId: string }) => removeGroupMember(token, v.groupId, v.userId));
export const useSetTeamGroup = () => useGroupMutation((token, v: { teamId: string; groupId: string; role: "admin" | "member" }) => setTeamGroup(token, v.teamId, v.groupId, v.role));
export const useRemoveTeamGroup = () => useGroupMutation((token, v: { teamId: string; groupId: string }) => removeTeamGroup(token, v.teamId, v.groupId));
