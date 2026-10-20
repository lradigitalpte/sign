// Mirrors the JSON returned by the Go API under /admin/v1 (internal/admin).

export type AdminRole = "read_only" | "support" | "super_admin";

export type Admin = {
  userId: string;
  email: string;
  name: string;
  role: AdminRole;
  grantedBy?: string;
  createdAt: string;
};

export type EnvelopeStatus = "draft" | "in_progress" | "completed" | "voided" | "expired";

export type Stats = {
  workspaces: { total: number; new7d: number; suspended: number };
  users: { total: number; new7d: number; suspended: number };
  envelopes: { byStatus: Record<EnvelopeStatus, number>; sent7d: number; completed7d: number };
  emailJobs: { pending: number; failed: number };
  webhooksUnprocessed: number;
  /** Workspaces per plan; "free" covers every workspace without a subscription. */
  plans?: Record<PlanId, number>;
  /** One entry per UTC day, oldest first, ending today. */
  activity: DayActivity[];
};

export type DayActivity = { date: string; sent: number; completed: number };

export type List<T> = { items: T[]; total: number; page: number; pageSize: number };

type Suspension = { suspendedAt: string | null; suspendedReason: string | null };

export type WorkspaceSummary = Suspension & {
  id: string;
  name: string;
  slug: string;
  ownerEmail: string | null;
  memberCount: number;
  envelopeCount: number;
  plan: PlanId;
  createdAt: string;
};

export type WorkspaceDetail = WorkspaceSummary & {
  envelopesByStatus: Record<EnvelopeStatus, number>;
  subscription: Subscription;
  privacy: WorkspacePrivacy;
  storageProvider: string;
  settingsSections: string[];
  members: { userId: string; name: string; email: string; role: string; joinedAt: string }[];
  invitations: { id: string; email: string; role: string; status: string; expiresAt: string; createdAt: string }[];
};

export type UserSummary = Suspension & {
  id: string;
  email: string;
  name: string;
  workspaceCount: number;
  adminRole: AdminRole | null;
  createdAt: string;
  /** Set once the person deleted their account; the record stays, anonymized. */
  deletedAt: string | null;
};

export type UserDetail = UserSummary & {
  accountDeletion: AccountDeletionRequest | null;
  emailVerifiedAt: string | null;
  envelopesSent: number;
  memberships: { workspaceId: string; workspaceName: string; role: string; joinedAt: string }[];
  identities: { provider: string; email: string | null; createdAt: string }[];
};

export type EnvelopeSummary = {
  id: string;
  title: string;
  status: EnvelopeStatus;
  isTemplate: boolean;
  workspaceId: string;
  workspaceName: string;
  senderName: string;
  senderEmail: string;
  /** Signers and approvers; viewers and CCs only receive copies. */
  recipientCount: number;
  completedCount: number;
  expiresAt: string | null;
  sentAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EnvelopeRecipient = {
  id: string;
  name: string;
  email: string;
  role: "signer" | "approver" | "viewer" | "cc";
  status: "pending" | "sent" | "viewed" | "completed" | "declined";
  signingOrder: number;
  sentAt: string | null;
  viewedAt: string | null;
  completedAt: string | null;
  declinedAt: string | null;
  declineReason: string | null;
  lastRemindedAt: string | null;
};

export type EnvelopeEvent = {
  id: string;
  type: string;
  actorName: string | null;
  recipientName: string | null;
  metadata: Record<string, unknown>;
  occurredAt: string;
};

export type EnvelopeJob = {
  id: string;
  kind: string;
  status: "pending" | "processing" | "sent" | "failed";
  recipientEmail: string;
  attempts: number;
  lastError: string | null;
  availableAt: string;
  sentAt: string | null;
  createdAt: string;
};

export type AdminAction = {
  id: string;
  action: string;
  adminName: string | null;
  adminEmail: string | null;
  reason: string | null;
  occurredAt: string;
};

export type EnvelopeDetail = EnvelopeSummary & {
  externalId: string | null;
  distributionMethod: string;
  autoReminders: boolean;
  requirePasscode: boolean;
  language: string;
  timezone: string;
  documents: { id: string; filename: string; pageCount: number; sizeBytes: number }[];
  recipients: EnvelopeRecipient[];
  events: EnvelopeEvent[];
  jobs: EnvelopeJob[];
  adminActions: AdminAction[];
  /** Set while the workspace lets Signet support open its documents. */
  supportAccessUntil: string | null;
};

export type JobState = "queued" | "retrying" | "gave_up" | "stuck" | "sent";

export type EmailJob = {
  id: string;
  kind: string;
  state: JobState;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  recipientName: string;
  recipientEmail: string;
  envelopeId: string;
  envelopeTitle: string;
  envelopeStatus: EnvelopeStatus;
  workspaceId: string;
  workspaceName: string;
  nextAttemptAt: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Why Retry is refused; empty when it's allowed. */
  retryBlocked: string;
};

export type JobCounts = { queued: number; retrying: number; gaveUp: number; stuck: number; sent24h: number; failed24h: number };

export type EmailJobList = List<EmailJob> & { counts: JobCounts };

export type EmailJobDetail = EmailJob & {
  history: { attempt: number; status: "sent" | "failed"; provider: string; error: string | null; occurredAt: string }[];
  adminActions: AdminAction[];
};

export type AuditEntry = {
  id: string;
  action: string;
  adminUserId: string | null;
  adminName: string | null;
  adminEmail: string | null;
  targetType: "workspace" | "user" | "envelope" | "job" | "admin" | "flag" | "webhook" | "announcement" | "deletion" | "plan";
  targetId: string;
  /** Current name of the target: workspace name, email, envelope title. Null once it's deleted. */
  targetLabel: string | null;
  reason: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  occurredAt: string;
};

export type PlanId = "free" | "starter" | "business" | "premium" | "enterprise";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";

export type Subscription = {
  plan: PlanId;
  seats: number;
  billingCycle: "monthly" | "annual" | null;
  status: SubscriptionStatus;
  periodEndsAt: string | null;
  /** Members who can send: everyone except viewers. */
  seatsUsed: number;
  updatedAt: string | null;
  /** What the workspace pays per seat per month (monthly equivalent on annual billing), in US cents. Null on Free or when no price is agreed. */
  seatPriceCents: number | null;
  /** The workspace pays through Stripe; its plan follows Stripe and can't be edited here. */
  managedByStripe: boolean;
  /** The customer canceled; the plan ends at periodEndsAt. */
  cancelAtPeriodEnd: boolean;
  /** Staff-only note, e.g. an invoice reference. */
  note: string | null;
};

export type WorkspaceUsage = {
  weeks: { week: string; sent: number; completed: number }[];
  sentThisMonth: number;
  activeSenders: number;
  storageBytes: number;
  documentsCount: number;
};

export type FeatureFlag = {
  key: string;
  description: string;
  enabled: boolean;
  overrides: { workspaceId: string; workspaceName: string; enabled: boolean; createdAt: string }[];
  createdAt: string;
  updatedAt: string;
};

export type WebhookEvent = {
  id: string;
  providerEventId: string;
  eventType: string;
  state: "processed" | "failed" | "pending";
  outcome: string | null;
  error: string | null;
  receivedAt: string;
  processedAt: string | null;
  payload?: unknown;
};

export type SupportGrant = {
  id: string;
  grantedByName: string | null;
  note: string | null;
  expiresAt: string;
  revokedAt: string | null;
  revokedByName: string | null;
  createdAt: string;
  active: boolean;
};

export type DeletionRequest = {
  id: string;
  /** Null once the workspace is deleted. */
  organizationId: string | null;
  organizationName: string;
  requestedByEmail: string;
  status: "scheduled" | "failed" | "completed" | "canceled";
  scheduledFor: string;
  canceledAt: string | null;
  completedAt: string | null;
  error: string | null;
  envelopesDeleted: number | null;
  filesDeleted: number | null;
  createdAt: string;
};

export type WorkspacePrivacy = {
  supportAccess: SupportGrant | null;
  deletion: DeletionRequest | null;
  retention: {
    autoDelete: boolean;
    retentionMonths: number;
    legalHold: boolean;
    active: boolean;
    runs: { envelopesDeleted: number; filesDeleted: number; error: string | null; ranAt: string }[];
  };
};

export type Announcement = {
  id: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "critical";
  /** Empty means every workspace. */
  plans: PlanId[];
  linkUrl: string | null;
  linkLabel: string | null;
  startsAt: string;
  endsAt: string | null;
  state: "scheduled" | "live" | "ended";
  createdBy: string | null;
  createdAt: string;
};

// ---- System health ----

export type HealthStatus = "ok" | "off" | "degraded" | "down";

export type HealthCheck = { key: string; name: string; status: HealthStatus; latencyMs: number | null; detail: string; error?: string };

export type ServiceInstance = {
  id: string;
  service: "api" | "worker";
  roles: string[];
  hostname: string;
  pid: number;
  version: string;
  startedAt: string;
  lastSeenAt: string;
  online: boolean;
  current: boolean;
  goroutines: number;
  memoryBytes: number;
};

export type ScheduledJobStatus = "ok" | "late" | "failing" | "never";

export type ScheduledJob = {
  name: string;
  label: string;
  description: string;
  runsOn: string;
  intervalSeconds: number;
  status: ScheduledJobStatus;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastDurationMs: number | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  lastInstance: string | null;
  runs: number;
  failures: number;
};

export type FileCategory = { key: "documents" | "signed" | "attachments" | "vault"; label: string; count: number; bytes: number; estimated: boolean };

export type SystemHealth = {
  status: Exclude<HealthStatus, "off">;
  checkedAt: string;
  environment: string;
  checks: HealthCheck[];
  runtime: {
    instanceId: string;
    version: string;
    goVersion: string;
    startedAt: string;
    numCpu: number;
    goroutines: number;
    heapBytes: number;
    sysBytes: number;
    gcCount: number;
    embeddedWorker: boolean;
    pool: { max: number; total: number; idle: number; inUse: number; acquires: number; waits: number };
  };
  instances: ServiceInstance[];
  jobs: ScheduledJob[];
  storage: {
    databaseBytes: number;
    tables: { name: string; bytes: number; rows: number }[];
    files: FileCategory[];
    customBucketWorkspaces: number;
    customBucketBytes: number;
    topWorkspaces: { id: string; name: string; bytes: number; files: number; customBucket: boolean }[];
  };
  emailQueue: JobCounts & { oldestQueuedAt: string | null };
};

export type AccountDeletionRequest = {
  id: string;
  userId: string;
  userEmail: string;
  status: "scheduled" | "failed" | "completed" | "canceled";
  scheduledFor: string;
  canceledAt: string | null;
  completedAt: string | null;
  error: string | null;
  /** Problems that didn't stop the deletion, e.g. the WorkOS login couldn't be removed. */
  warning: string | null;
  workspacesDeleted: number | null;
  createdAt: string;
};

// ---- Plans & billing ----

export type PaidPlanId = Exclude<PlanId, "free">;

/** A paid plan's list price in US cents per seat per month; annual is the monthly equivalent billed yearly. Null prices mean "contact sales". */
export type PlanPrice = { plan: PaidPlanId; monthlyCents: number | null; annualCents: number | null; updatedAt: string };

export type PlanRevenue = PlanPrice & {
  updatedByName: string | null;
  workspaces: number;
  seats: number;
  mrrCents: number;
  trialing: number;
  offListWorkspaces: number;
  unpricedWorkspaces: number;
};

export type BillingEventKind = "renewal" | "trial_end" | "access_end" | "past_due";

export type BillingEvent = {
  kind: BillingEventKind;
  workspaceId: string;
  workspaceName: string;
  plan: PaidPlanId;
  seats: number;
  billingCycle: "monthly" | "annual" | null;
  date: string | null;
  amountCents: number | null;
};

export type PriceSet = { monthlyCents: number | null; annualCents: number | null };

export type BillingOverview = {
  currency: string;
  mrrCents: number;
  arrCents: number;
  payingWorkspaces: number;
  paidSeats: number;
  freeWorkspaces: number;
  annualMrrCents: number;
  monthlyMrrCents: number;
  pastDueWorkspaces: number;
  pastDueMrrCents: number;
  trialingWorkspaces: number;
  trialMrrCents: number;
  listPriceDeltaCents: number;
  plans: PlanRevenue[];
  upcoming: BillingEvent[];
  priceChanges: { plan: PaidPlanId; adminName: string | null; reason: string | null; before: PriceSet; after: PriceSet; occurredAt: string }[];
};
