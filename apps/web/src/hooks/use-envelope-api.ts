"use client";

import { useAccessToken } from "@workos-inc/authkit-nextjs/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getEnvelope,
  getEnvelopeReview,
  getMe,
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

export function useInvitations() {
  const { getAccessToken, loading } = usePlatformToken();
  return useQuery({
    queryKey: ["members-invitations"],
    enabled: !loading,
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

