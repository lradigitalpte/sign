export const platformApiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(status: number, message: string, payload?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

export type RecipientSummary = {
  id: string;
  name: string;
  email: string;
  role: "signer" | "approver" | "viewer" | "cc";
  status: "pending" | "sent" | "viewed" | "completed" | "declined";
  signingOrder: number;
};

export type Envelope = {
  id: string;
  organizationId: string;
  createdBy: string;
  senderName?: string;
  senderEmail?: string;
  title: string;
  status: "draft" | "in_progress" | "completed" | "voided" | "expired";
  language: string;
  timezone: string;
  dateFormat: string;
  allowedSignatureTypes?: string;
  distributionMethod?: string;
  externalId?: string;
  redirectUrl?: string;
  emailSubject?: string;
  emailBody?: string;
  folderId?: string;
  autoReminders?: boolean;
  firstReminderDays?: number;
  repeatReminderDays?: number;
  notifyOnView?: boolean;
  notifyOnSign?: boolean;
  attachCompletedPdf?: boolean;
  sessionTimeoutMinutes?: number;
  requirePasscode?: boolean;
  expiresAt?: string;
  isTemplate: boolean;
  createdAt: string;
  updatedAt: string;
  recipients?: RecipientSummary[];
};

export type Folder = {
  id: string;
  organizationId: string;
  name: string;
  createdBy: string;
  envelopeCount: number;
  createdAt: string;
  updatedAt: string;
};

export type EnvelopeDocument = {
  id: string;
  envelopeId: string;
  position: number;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number;
  sha256: string;
  completedSha256?: string;
  createdAt: string;
};

export type EnvelopeRecipient = {
  id: string;
  envelopeId: string;
  name: string;
  email: string;
  role: "signer" | "approver" | "viewer" | "cc";
  status: "pending" | "sent" | "viewed" | "completed" | "declined";
  signingOrder: number;
  privateMessage?: string;
  createdAt: string;
  updatedAt: string;
};

export type EnvelopeAttachment = {
  id: string;
  envelopeId: string;
  kind: "link" | "file";
  label: string;
  url?: string;
  filename?: string;
  mimeType?: string;
  sizeBytes?: number;
  sha256?: string;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type ReviewDocument = {
  id: string;
  filename: string;
  pageCount: number;
  fieldCount: number;
};

export type ReviewRecipient = {
  id: string;
  name: string;
  email: string;
  role: EnvelopeRecipient["role"];
  signingOrder: number;
  fieldCount: number;
  requiredFieldCount: number;
  actionable: boolean;
  missingRequiredFields: boolean;
};

export type EnvelopeReview = {
  envelopeId: string;
  title: string;
  status: Envelope["status"];
  ready: boolean;
  errors: string[];
  warnings: string[];
  documents: ReviewDocument[];
  recipients: ReviewRecipient[];
  fieldCounts: {
    total: number;
    required: number;
    byType: Record<string, number>;
  };
};

export type SendResult = {
  envelopeId: string;
  status: string;
  invitationsQueued: number;
  idempotentReplay: boolean;
};

type Collection<T> = { data: T[] };

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { error: text };
  }
}

export type EnvelopeField = {
  id: string;
  documentId: string;
  recipientId: string;
  type: "signature" | "initials" | "name" | "date" | "text" | "checkbox" | "attachment" | "dropdown" | "radio";
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  required: boolean;
  options?: string[];
  createdAt: string;
  updatedAt: string;
};

export async function platformRequest<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${platformApiUrl}${path}`, {
    ...init,
    headers,
  });
  const payload = await readJson(response);
  if (!response.ok) {
    throw new ApiError(response.status, typeof payload.error === "string" ? payload.error : "Request failed", payload);
  }
  return payload as T;
}

export function listEnvelopes(token: string, options?: { status?: string; folderId?: string; type?: "template" }) {
  const params = new URLSearchParams();
  if (options?.status) {
    params.set("status", options.status);
  }
  if (options?.folderId) {
    params.set("folderId", options.folderId);
  }
  if (options?.type) {
    params.set("type", options.type);
  }
  const query = params.toString() ? `?${params.toString()}` : "";
  return platformRequest<Collection<Envelope>>(token, `/v1/envelopes${query}`).then((body) => body.data ?? []);
}

export function listFolders(token: string) {
  return platformRequest<Collection<Folder>>(token, "/v1/folders").then((body) => body.data ?? []);
}

export function createFolder(token: string, input: { name: string }) {
  return platformRequest<Folder>(token, "/v1/folders", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateFolder(token: string, folderId: string, input: { name: string }) {
  return platformRequest<Folder>(token, `/v1/folders/${folderId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteFolder(token: string, folderId: string) {
  return platformRequest<unknown>(token, `/v1/folders/${folderId}`, { method: "DELETE" });
}

export function transferFolderEnvelopes(token: string, folderId: string, toFolderId: string | null) {
  return platformRequest<{ moved: number }>(token, `/v1/folders/${folderId}/transfer`, {
    method: "POST",
    body: JSON.stringify({ toFolderId }),
  });
}

export function moveEnvelopeToFolder(token: string, envelopeId: string, folderId: string | null) {
  return platformRequest<Envelope>(token, `/v1/envelopes/${envelopeId}/folder`, {
    method: "PATCH",
    body: JSON.stringify({ folderId }),
  });
}

export function bulkMoveEnvelopesToFolder(token: string, envelopeIds: string[], folderId: string | null) {
  return platformRequest<{ affected: number }>(token, "/v1/envelopes/bulk/move", {
    method: "POST",
    body: JSON.stringify({ envelopeIds, folderId }),
  });
}

export function bulkDeleteEnvelopes(token: string, envelopeIds: string[]) {
  return platformRequest<{ affected: number }>(token, "/v1/envelopes/bulk/delete", {
    method: "POST",
    body: JSON.stringify({ envelopeIds }),
  });
}

export function bulkVoidEnvelopes(token: string, envelopeIds: string[]) {
  return platformRequest<{ affected: number }>(token, "/v1/envelopes/bulk/void", {
    method: "POST",
    body: JSON.stringify({ envelopeIds }),
  });
}

export function createEnvelope(token: string, input: { title: string; language?: string; timezone?: string; isTemplate?: boolean }) {
  return platformRequest<Envelope>(token, "/v1/envelopes", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getEnvelope(token: string, envelopeId: string) {
  return platformRequest<Envelope>(token, `/v1/envelopes/${envelopeId}`);
}

export function getEnvelopeReview(token: string, envelopeId: string) {
  return platformRequest<EnvelopeReview>(token, `/v1/envelopes/${envelopeId}/review`);
}

export function listEnvelopeDocuments(token: string, envelopeId: string) {
  return platformRequest<Collection<EnvelopeDocument>>(token, `/v1/envelopes/${envelopeId}/documents`).then((body) => body.data ?? []);
}

export function uploadEnvelopeDocument(token: string, envelopeId: string, file: File) {
  const body = new FormData();
  body.append("file", file);
  return platformRequest<EnvelopeDocument>(token, `/v1/envelopes/${envelopeId}/documents`, {
    method: "POST",
    body,
  });
}

export function listEnvelopeRecipients(token: string, envelopeId: string) {
  return platformRequest<Collection<EnvelopeRecipient>>(token, `/v1/envelopes/${envelopeId}/recipients`).then((body) => body.data ?? []);
}

export function createEnvelopeRecipient(
  token: string,
  envelopeId: string,
  input: { name: string; email: string; role: EnvelopeRecipient["role"]; signingOrder?: number; privateMessage?: string },
) {
  return platformRequest<EnvelopeRecipient>(token, `/v1/envelopes/${envelopeId}/recipients`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateEnvelopeRecipient(
  token: string,
  envelopeId: string,
  recipientId: string,
  input: { name?: string; email?: string; role?: EnvelopeRecipient["role"]; signingOrder?: number; privateMessage?: string },
) {
  return platformRequest<EnvelopeRecipient>(token, `/v1/envelopes/${envelopeId}/recipients/${recipientId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteEnvelopeRecipient(token: string, envelopeId: string, recipientId: string) {
  return platformRequest<unknown>(token, `/v1/envelopes/${envelopeId}/recipients/${recipientId}`, { method: "DELETE" });
}

export function listEnvelopeAttachments(token: string, envelopeId: string) {
  return platformRequest<Collection<EnvelopeAttachment>>(token, `/v1/envelopes/${envelopeId}/attachments`).then((body) => body.data ?? []);
}

export function createEnvelopeAttachment(
  token: string,
  envelopeId: string,
  input: { label: string; url: string; position?: number },
) {
  return platformRequest<EnvelopeAttachment>(token, `/v1/envelopes/${envelopeId}/attachments`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function uploadEnvelopeAttachmentFile(token: string, envelopeId: string, label: string, file: File) {
  const body = new FormData();
  body.append("file", file);
  body.append("label", label);
  return platformRequest<EnvelopeAttachment>(token, `/v1/envelopes/${envelopeId}/attachments`, {
    method: "POST",
    body,
  });
}

export function updateEnvelopeAttachment(
  token: string,
  envelopeId: string,
  attachmentId: string,
  input: { label?: string; url?: string; position?: number },
) {
  return platformRequest<EnvelopeAttachment>(token, `/v1/envelopes/${envelopeId}/attachments/${attachmentId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteEnvelopeAttachment(token: string, envelopeId: string, attachmentId: string) {
  return platformRequest<unknown>(token, `/v1/envelopes/${envelopeId}/attachments/${attachmentId}`, { method: "DELETE" });
}

export function listEnvelopeFields(token: string, envelopeId: string) {
  return platformRequest<Collection<EnvelopeField>>(token, `/v1/envelopes/${envelopeId}/fields`).then((body) => body.data ?? []);
}

export function createEnvelopeField(
  token: string,
  envelopeId: string,
  input: {
    documentId: string;
    recipientId: string;
    type: EnvelopeField["type"];
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    label?: string;
    required?: boolean;
    options?: string[];
  },
) {
  return platformRequest<EnvelopeField>(token, `/v1/envelopes/${envelopeId}/fields`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateEnvelopeField(
  token: string,
  envelopeId: string,
  fieldId: string,
  input: Partial<Pick<EnvelopeField, "recipientId" | "page" | "x" | "y" | "width" | "height" | "label" | "required" | "options">>,
) {
  const body: Record<string, unknown> = {};
  if (input.recipientId !== undefined) body.recipientId = input.recipientId;
  if (input.page !== undefined) body.page = input.page;
  if (input.x !== undefined) body.x = input.x;
  if (input.y !== undefined) body.y = input.y;
  if (input.width !== undefined) body.width = input.width;
  if (input.height !== undefined) body.height = input.height;
  if (input.label !== undefined) body.label = input.label;
  if (input.required !== undefined) body.required = input.required;
  if (input.options !== undefined) body.options = input.options;
  return platformRequest<EnvelopeField>(token, `/v1/envelopes/${envelopeId}/fields/${fieldId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteEnvelopeField(token: string, envelopeId: string, fieldId: string) {
  return platformRequest<unknown>(token, `/v1/envelopes/${envelopeId}/fields/${fieldId}`, { method: "DELETE" });
}

export function sendEnvelope(token: string, envelopeId: string, idempotencyKey: string) {
  return platformRequest<SendResult>(token, `/v1/envelopes/${envelopeId}/send`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

export type MeResponse = {
  user: { id: string; email: string; name: string; avatarDataUrl?: string };
  workspace: { id: string; name: string; slug: string; role: string };
  permissions?: string[];
};

export type SignatureAppearance = {
  id?: string;
  name?: string;
  text: string;
  image?: string;
  source?: "draw" | "upload" | "type";
  font?: string;
  color?: string;
  items?: SignatureAppearance[];
};
export type SignaturePreferences = { signature?: SignatureAppearance; initials?: SignatureAppearance };

export type SecuredPDF = {
  id: string;
  filename: string;
  sourceFilename: string;
  operation: "encrypted" | "decrypted";
  sizeBytes: number;
  sha256: string;
  createdAt: string;
  updatedAt: string;
  passwordVersion: number;
  passwordStatus: string;
};

export function listSecuredPDFs(token: string) {
  return platformRequest<Collection<SecuredPDF>>(token, "/v1/pdf-security/files").then((body) => body.data ?? []);
}

export function revealSecuredPDFPassword(token: string, fileId: string) {
  return platformRequest<{ password: string; version: number }>(token, `/v1/pdf-security/files/${fileId}/password/reveal`, { method: "POST" });
}

export function deleteSecuredPDF(token: string, fileId: string) {
  return platformRequest<unknown>(token, `/v1/pdf-security/files/${fileId}`, { method: "DELETE" });
}
export type PDFPasswordVersion={version:number;password?:string;status:"active"|"retired"|"deleted";createdAt:string;retiredAt?:string};
export function listSecuredPDFPasswords(token:string,fileId:string){return platformRequest<Collection<PDFPasswordVersion>>(token,`/v1/pdf-security/files/${fileId}/passwords`).then(x=>x.data??[])}
export function rotateSecuredPDFPassword(token:string,fileId:string,password:string){return platformRequest<{version:number;password:string}>(token,`/v1/pdf-security/files/${fileId}/password/rotate`,{method:"POST",body:JSON.stringify({password})})}
export function deleteSecuredPDFPassword(token:string,fileId:string,version:number){return platformRequest<unknown>(token,`/v1/pdf-security/files/${fileId}/passwords/${version}`,{method:"DELETE"})}

export async function fetchSecuredPDF(token: string, fileId: string) {
  const response = await fetch(`${platformApiUrl}/v1/pdf-security/files/${fileId}/download`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new ApiError(response.status, "Unable to download PDF");
  return response.blob();
}

export function getSignaturePreferences(token: string) {
  return platformRequest<SignaturePreferences>(token, "/v1/me/signature-preferences");
}

export function updateSignaturePreferences(token: string, input: SignaturePreferences) {
  return platformRequest<SignaturePreferences>(token, "/v1/me/signature-preferences", { method: "PUT", body: JSON.stringify(input) });
}

export type InboxItem = {
  recipientId: string;
  envelopeId: string;
  title: string;
  status: EnvelopeRecipient["status"];
  role: EnvelopeRecipient["role"];
  senderName: string;
  companyName: string;
  fieldCount: number;
  expiresAt?: string;
  updatedAt: string;
};

export type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
};

export type OrganizationInvitation = {
  id: string;
  organizationId: string;
  email: string;
  role: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  token: string;
  invitedBy: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

export type AuditEvent = {
  id: string;
  eventType: string;
  actorName?: string;
  recipientName?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata: Record<string, unknown>;
  occurredAt: string;
};

export type SigningField = EnvelopeField & { value?: unknown; completed: boolean };

export type OrganizationBrand = {
  logoDataUrl?: string;
  brandName?: string;
  primaryColor?: string;
  hidePlatformBranding?: boolean;
};

export type SigningSession = {
  organizationName: string;
  organizationBrand: OrganizationBrand;
  envelope: Pick<Envelope, "id" | "title" | "status" | "language"> & { expiresAt?: string };
  recipient: Pick<EnvelopeRecipient, "id" | "name" | "email" | "role" | "status" | "privateMessage">;
  documents: Array<Pick<EnvelopeDocument, "id" | "filename" | "pageCount">>;
  fields: SigningField[];
  attachments: Array<Pick<EnvelopeAttachment, "id" | "kind" | "label" | "url" | "filename" | "mimeType" | "position">>;
  remainingRequired: number;
  canAct: boolean;
};

export function getMe(token: string) {
  return platformRequest<MeResponse>(token, "/v1/me");
}

export function updateProfile(token: string, input: { name: string; avatarDataUrl: string | null }) {
  return platformRequest<MeResponse["user"]>(token, "/v1/me", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export type WorkspaceSettings = Record<string, string | boolean | number>;
export type CollaborationSpace = { id: string; name: string; slug?: string; description?: string; memberCount: number; createdAt?: string };
export function listTeams(token:string){return platformRequest<Collection<CollaborationSpace>>(token,"/v1/teams").then(x=>x.data??[])}
export function createTeam(token:string,name:string){return platformRequest<CollaborationSpace>(token,"/v1/teams",{method:"POST",body:JSON.stringify({name})})}
export function listGroups(token:string){return platformRequest<Collection<CollaborationSpace>>(token,"/v1/groups").then(x=>x.data??[])}
export function createGroup(token:string,name:string,description:string){return platformRequest<CollaborationSpace>(token,"/v1/groups",{method:"POST",body:JSON.stringify({name,description})})}

export function getWorkspaceSettings(token: string, section: string) {
  return platformRequest<{ section: string; config: WorkspaceSettings }>(token, `/v1/workspace/settings/${section}/`).then((body) => body.config ?? {});
}

export function updateWorkspaceSettings(token: string, section: string, config: WorkspaceSettings) {
  return platformRequest<{ section: string; config: WorkspaceSettings }>(token, `/v1/workspace/settings/${section}/`, { method: "PUT", body: JSON.stringify(config) }).then((body) => body.config);
}

export type WorkspaceStorageConfig = {
  provider: "platform" | "s3" | "r2" | "s3_compatible";
  endpoint: string;
  bucket: string;
  region: string;
  useSsl: boolean;
  accessKeyId: string;
  secretAccessKeySet: boolean;
  enabled: boolean;
  lastTestedAt?: string | null;
  lastError?: string;
  usingPlatform: boolean;
};

export type WorkspaceStorageInput = {
  provider: WorkspaceStorageConfig["provider"];
  endpoint: string;
  bucket: string;
  region: string;
  useSsl: boolean;
  accessKeyId: string;
  secretAccessKey?: string;
  enabled: boolean;
};

export function getWorkspaceStorage(token: string) {
  return platformRequest<WorkspaceStorageConfig>(token, "/v1/workspace/storage/");
}

export function updateWorkspaceStorage(token: string, input: WorkspaceStorageInput) {
  return platformRequest<WorkspaceStorageConfig>(token, "/v1/workspace/storage/", { method: "PUT", body: JSON.stringify(input) });
}

export function testWorkspaceStorage(token: string, input?: WorkspaceStorageInput) {
  return platformRequest<WorkspaceStorageConfig>(token, "/v1/workspace/storage/test", {
    method: "POST",
    body: input ? JSON.stringify(input) : "{}",
  });
}

export function disconnectWorkspaceStorage(token: string) {
  return platformRequest<WorkspaceStorageConfig>(token, "/v1/workspace/storage/", { method: "DELETE" });
}

export function listInbox(token: string) {
  return platformRequest<Collection<InboxItem>>(token, "/v1/inbox").then((body) => body.data ?? []);
}

export function accessInboxItem(token: string, recipientId: string) {
  return platformRequest<{ token: string }>(token, `/v1/inbox/${recipientId}/access`, { method: "POST" });
}

export function listMembers(token: string) {
  return platformRequest<Collection<Member>>(token, "/v1/members").then((body) => body.data ?? []);
}

export function updateMemberRole(token: string, memberId: string, role: string) {
  return platformRequest<{ status: string }>(token, `/v1/members/${memberId}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

export function removeMember(token: string, memberId: string) {
  return platformRequest<{ status: string }>(token, `/v1/members/${memberId}`, {
    method: "DELETE",
  });
}

export function listInvitations(token: string) {
  return platformRequest<Collection<OrganizationInvitation>>(token, "/v1/members/invitations").then((body) => body.data ?? []);
}

export function inviteMember(token: string, input: { email: string; role: string }) {
  return platformRequest<OrganizationInvitation>(token, "/v1/members/invite", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function revokeInvitation(token: string, invitationId: string) {
  return platformRequest<{ status: string }>(token, `/v1/members/invitations/${invitationId}`, {
    method: "DELETE",
  });
}

export function resendInvitation(token: string, invitationId: string) {
  return platformRequest<OrganizationInvitation>(token, `/v1/members/invitations/${invitationId}/resend`, {
    method: "POST",
  });
}

export function listEnvelopeAudit(token: string, envelopeId: string) {
  return platformRequest<Collection<AuditEvent>>(token, `/v1/envelopes/${envelopeId}/audit`).then((body) => body.data ?? []);
}

export function updateEnvelope(
  token: string,
  envelopeId: string,
  input: {
    title?: string;
    language?: string;
    timezone?: string;
    dateFormat?: string;
    allowedSignatureTypes?: string;
    distributionMethod?: string;
    externalId?: string | null;
    redirectUrl?: string | null;
    emailSubject?: string;
    emailBody?: string;
    autoReminders?: boolean;
    firstReminderDays?: number;
    repeatReminderDays?: number;
    notifyOnView?: boolean;
    notifyOnSign?: boolean;
    attachCompletedPdf?: boolean;
    sessionTimeoutMinutes?: number;
    requirePasscode?: boolean;
    passcode?: string;
    expiresAt?: string | null;
  },
) {
  return platformRequest<Envelope>(token, `/v1/envelopes/${envelopeId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteEnvelope(token: string, envelopeId: string) {
  return platformRequest<unknown>(token, `/v1/envelopes/${envelopeId}`, { method: "DELETE" });
}

export function duplicateEnvelope(token: string, envelopeId: string) {
  return platformRequest<Envelope>(token, `/v1/envelopes/${envelopeId}/duplicate`, { method: "POST" });
}

export function saveEnvelopeAsTemplate(token: string, envelopeId: string) {
  return platformRequest<Envelope>(token, `/v1/envelopes/${envelopeId}/save-as-template`, { method: "POST" });
}

export function voidEnvelope(token: string, envelopeId: string) {
  return platformRequest<Envelope>(token, `/v1/envelopes/${envelopeId}/void`, { method: "POST" });
}

export function remindEnvelope(token: string, envelopeId: string) {
  return platformRequest<{ envelopeId: string; remindersQueued: number }>(token, `/v1/envelopes/${envelopeId}/reminders`, {
    method: "POST",
  });
}

export function createEnvelopeShareLink(token: string, envelopeId: string, recipientId: string) {
  return platformRequest<{ token: string }>(token, `/v1/envelopes/${envelopeId}/share-links/${recipientId}`, { method: "POST" });
}

export function deleteEnvelopeDocument(token: string, envelopeId: string, documentId: string) {
  return platformRequest<unknown>(token, `/v1/envelopes/${envelopeId}/documents/${documentId}`, { method: "DELETE" });
}

export async function publicRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${platformApiUrl}${path}`, { ...init, headers });
  const payload = await readJson(response);
  if (!response.ok) {
    throw new ApiError(response.status, typeof payload.error === "string" ? payload.error : "Request failed", payload);
  }
  return payload as T;
}

export function getSigningSession(token: string) {
  return publicRequest<SigningSession>(`/v1/sign/${encodeURIComponent(token)}`);
}

export function viewSigningSession(token: string) {
  return publicRequest<SigningSession>(`/v1/sign/${encodeURIComponent(token)}/view`, { method: "POST" });
}

export function saveSigningField(
  token: string,
  fieldId: string,
  value: unknown,
  placement?: { page?: number; x?: number; y?: number; width?: number; height?: number },
) {
  return publicRequest<{ field: SigningField; session: SigningSession }>(`/v1/sign/${encodeURIComponent(token)}/fields/${fieldId}`, {
    method: "POST",
    body: JSON.stringify({ value, placement }),
  });
}

export function updateSigningFieldPlacement(
  token: string,
  fieldId: string,
  placement: { page: number; x: number; y: number; width: number; height: number },
) {
  return publicRequest<{ field: SigningField; session: SigningSession }>(`/v1/sign/${encodeURIComponent(token)}/fields/${fieldId}`, {
    method: "PATCH",
    body: JSON.stringify(placement),
  });
}

export function createSigningField(
  token: string,
  input: {
    documentId: string;
    type: EnvelopeField["type"];
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
  },
) {
  return publicRequest<{ field: SigningField; session: SigningSession }>(`/v1/sign/${encodeURIComponent(token)}/fields`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteSigningField(token: string, fieldId: string) {
  return publicRequest<{ session: SigningSession }>(`/v1/sign/${encodeURIComponent(token)}/fields/${fieldId}`, {
    method: "DELETE",
  });
}

export function completeSigning(token: string) {
  return publicRequest<SigningSession>(`/v1/sign/${encodeURIComponent(token)}/complete`, { method: "POST" });
}

export function declineSigning(token: string, reason: string) {
  return publicRequest<{ status: string }>(`/v1/sign/${encodeURIComponent(token)}/decline`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function signingDocumentPath(token: string, documentId: string) {
  return `/api/sign/${encodeURIComponent(token)}/documents/${documentId}/file`;
}

export function signingAttachmentPath(token: string, attachmentId: string) {
  return `/api/sign/${encodeURIComponent(token)}/attachments/${attachmentId}/file`;
}

export function envelopeAttachmentPath(envelopeId: string, attachmentId: string) {
  return `/api/envelopes/${encodeURIComponent(envelopeId)}/attachments/${attachmentId}/file`;
}

export async function uploadSigningFieldFile(token: string, fieldId: string, file: File) {
  const body = new FormData();
  body.append("file", file);
  return publicRequest<{ field: SigningField; session: SigningSession }>(
    `/v1/sign/${encodeURIComponent(token)}/fields/${fieldId}/upload`,
    { method: "POST", body },
  );
}

export function documentFilePath(envelopeId: string, documentId: string, version?: "completed") {
  const query = version === "completed" ? "?version=completed" : "";
  return `/api/envelopes/${envelopeId}/documents/${documentId}/file${query}`;
}

export function certificateFilePath(envelopeId: string) {
  return `/api/envelopes/${envelopeId}/certificate`;
}

export function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export const recipientTones = ["bg-blue-600", "bg-cyan-600", "bg-violet-600", "bg-amber-600", "bg-rose-600", "bg-emerald-600"] as const;

export const recipientPalette = [
  { color: "#2563eb", bgTone: "bg-blue-500/10", borderTone: "border-blue-500", badgeTone: "bg-blue-500 text-white" },
  { color: "#0891b2", bgTone: "bg-cyan-500/10", borderTone: "border-cyan-500", badgeTone: "bg-cyan-600 text-white" },
  { color: "#7c3aed", bgTone: "bg-violet-500/10", borderTone: "border-violet-500", badgeTone: "bg-violet-600 text-white" },
  { color: "#d97706", bgTone: "bg-amber-500/10", borderTone: "border-amber-500", badgeTone: "bg-amber-600 text-white" },
  { color: "#e11d48", bgTone: "bg-rose-500/10", borderTone: "border-rose-500", badgeTone: "bg-rose-600 text-white" },
  { color: "#059669", bgTone: "bg-emerald-500/10", borderTone: "border-emerald-500", badgeTone: "bg-emerald-600 text-white" },
] as const;

export function formatBytes(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function languageLabel(code: string) {
  const labels: Record<string, string> = {
    en: "English",
    fr: "Français",
    es: "Español",
    ar: "العربية",
  };
  return labels[code] ?? code;
}

