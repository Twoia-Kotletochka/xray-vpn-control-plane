export type AdminUserRecord = {
  id: string;
  email: string;
  username: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AuthSessionPayload = {
  accessToken: string;
  accessTokenTtl: string;
  admin: {
    id: string;
    email: string;
    username: string;
    role: string;
  };
};

export type ClientRecord = {
  id: string;
  uuid: string;
  emailTag: string;
  displayName: string;
  note: string | null;
  tags: string[];
  status: 'ACTIVE' | 'DISABLED' | 'EXPIRED' | 'BLOCKED';
  createdAt: string;
  updatedAt: string;
  startsAt: string | null;
  expiresAt: string | null;
  durationDays: number | null;
  trafficLimitBytes: string | null;
  isTrafficUnlimited: boolean;
  trafficUsedBytes: string;
  incomingBytes: string;
  outgoingBytes: string;
  remainingTrafficBytes: string | null;
  deviceLimit: number | null;
  ipLimit: number | null;
  subscriptionToken: string;
  transportProfile: string;
  xrayInboundTag: string;
  activeConnections: number;
  lastActivatedAt: string | null;
  lastSeenAt: string | null;
};

export type ClientListResponse = {
  items: ClientRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
  filters: {
    search: string | null;
  };
};

export type ClientDetailResponse = ClientRecord & {
  usageHistory: Array<{
    date: string;
    incomingBytes: string;
    outgoingBytes: string;
    totalBytes: string;
    activeConnections: number;
  }>;
};

export type ClientSubscriptionBundle = {
  client: ClientRecord;
  config: {
    uri: string;
    qrcodeText: string;
    subscriptionUrl: string;
  };
  instructions: string[];
  platformGuides: Array<{
    platform: string;
    clientApp: string;
    steps: string[];
  }>;
};

export type ClientExportBundle = {
  schemaVersion: number;
  exportedAt: string;
  items: ClientRecord[];
};

export type ClientImportResult = {
  created: number;
  overwriteExisting: boolean;
  skipped: number;
  synced: number;
  updated: number;
};

export type DashboardSummary = {
  totals: {
    clients: number;
    active: number;
    expired: number;
    disabled: number;
    blocked: number;
    totalTrafficBytes: string;
  };
  host: {
    cpuPercent: number | null;
    ramPercent: number | null;
    diskPercent: number | null;
  };
  runtime: {
    lastConfigSyncAt: string | null;
    lastStatsSnapshotAt: string | null;
    onlineUsers: number;
    xrayStatus: string;
  };
  message: string;
};

export type SubscriptionTemplatesResponse = {
  items: Array<{
    id: string;
    profile: string;
    platformTargets: string[];
    qrReady: boolean;
  }>;
};

export type AuditLogResponse = {
  items: Array<{
    id: string;
    actorAdminId: string | null;
    action: string;
    entityType: string;
    entityId: string | null;
    summary: string;
    metadata: unknown;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: string;
  }>;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
};

export type AdminUsersResponse = {
  items: AdminUserRecord[];
  total: number;
  capabilities: {
    twoFactorReady: boolean;
    roleModel: string[];
  };
};

export type SystemStatusResponse = {
  services: Array<{
    details: string;
    latencyMs: number;
    name: string;
    status: string;
    target: string;
  }>;
  host: {
    cpuPercent: number | null;
    ramPercent: number | null;
    diskPercent: number | null;
  };
  runtime: {
    apiTarget: string;
    lastConfigSyncAt: string | null;
    lastStatsSnapshotAt: string | null;
    lastSyncReason: string | null;
    latencyMs: number;
    onlineUsers: number;
    status: string;
    uptimeSeconds: number | null;
  };
  message: string;
};

export type BackupRecord = {
  id: string;
  fileName: string;
  checksumSha256: string;
  fileSizeBytes: string;
  status: string;
  createdAt: string;
  restoredAt: string | null;
  notes: string | null;
  exists: boolean;
};

export type BackupListResponse = {
  items: BackupRecord[];
  policy: {
    backupDir: string;
    retentionDays: number;
    restoreCommand: string;
  };
};

export type LogSourceRecord = {
  id: string;
  label: string;
  path: string;
  available: boolean;
};

export type LogSourceListResponse = {
  items: LogSourceRecord[];
};

export type LogContentResponse = {
  sourceId: string;
  label: string;
  path: string;
  exists: boolean;
  content: string;
  sizeBytes?: number;
  updatedAt?: string;
};
