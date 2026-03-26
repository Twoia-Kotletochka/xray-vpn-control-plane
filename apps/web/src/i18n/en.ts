import type { DeepTranslate } from './schema';
import { ru } from './ru';

export const en: DeepTranslate<typeof ru> = {
  common: {
    operations: 'operations',
    protectedAccess: 'Protected access',
    transportProfile: 'Transport profile',
    globalSearchPlaceholder: 'Search clients, tags, and audit events',
    operationsConsole: 'Operations Console',
    notAvailable: 'N/A',
    languageLabel: 'Language',
    languageRussian: 'RU',
    languageEnglish: 'EN',
    openNavigation: 'Open navigation',
    closeNavigation: 'Close navigation',
    closeDialog: 'Close dialog',
    logout: 'Log out',
    refresh: 'Refresh',
    cancel: 'Cancel',
    loading: 'Loading...',
    checkingSession: 'Checking the active administrator session.',
  },
  navigation: {
    dashboard: 'Dashboard',
    clients: 'Clients',
    subscriptions: 'Subscriptions',
    serverStatus: 'Server status',
    logs: 'Logs',
    backups: 'Backups',
    help: 'Help',
    adminUsers: 'Admin users',
    auditLog: 'Audit log',
  },
  auth: {
    eyebrow: 'secure administrator access',
    title: 'Sign in to server-vpn',
    description: 'Sign in with an administrator account to open the control panel.',
    username: 'Username',
    usernamePlaceholder: 'admin',
    password: 'Password',
    passwordPlaceholder: '••••••••••••',
    submit: 'Continue',
    signIn: 'Sign in',
    signingIn: 'Signing in...',
    loginFailed: 'Sign-in failed. Check the username and password.',
    twoFactorBanner:
      'Password accepted. Enter the six-digit code from your authenticator app to complete sign-in.',
    twoFactorCode: 'Verification code',
    twoFactorPlaceholder: '123456',
    verifyCode: 'Verify sign-in',
    verifyingCode: 'Verifying code...',
    changeCredentials: 'Change username or password',
  },
  dashboard: {
    title: 'Dashboard',
    description:
      'A single operations surface for client lifecycle, server health, and traffic visibility.',
    actionLabel: 'Create client',
    metrics: [
      { label: 'Active clients', hint: 'ready for live data' },
      { label: 'Expired clients', hint: 'expiry engine wiring is the next step' },
      { label: 'Monthly traffic', hint: 'daily rollup aggregation comes next' },
      { label: 'Host load', hint: 'system metrics are still being wired in' },
    ],
    releaseFocus: {
      title: 'Release focus',
      subtitle:
        'The first release prioritizes safe operations, clear data boundaries, and predictable Xray updates.',
      items: [
        'Secure admin authentication with refresh sessions and a foundation for future 2FA.',
        'Client limits, expirations, subscription generation, and audit trails.',
        'Clear health signals for the API, database, Xray, and backups.',
      ],
    },
    realityFirst: {
      title: 'Why REALITY comes first',
      subtitle:
        'The data plane stays simple and fast, while the panel can evolve independently without unnecessary coupling.',
      transport: 'Transport',
      panelTls: 'Panel TLS',
      persistence: 'Persistence',
      transportValue: 'VLESS + REALITY',
      panelTlsValue: 'HTTPS on 8443',
      persistenceValue: 'PostgreSQL + Prisma',
    },
  },
  clients: {
    title: 'Clients',
    description:
      'Client management with search, quick expiry and quota actions, QR output, and safe suspension.',
    actionLabel: 'New client',
    registryTitle: 'Client registry',
    registrySubtitle:
      'The table, filters, and action density are already tuned for an operator workflow close to Marzban.',
    searchPlaceholder: 'Search by name, tag, UUID, or note',
    resetFilters: 'Reset filters',
    addClient: 'Add client',
    columns: {
      client: 'Client',
      status: 'Status',
      traffic: 'Traffic',
      expiry: 'Expiry',
      actions: 'Actions',
    },
    draft: {
      id: 'draft',
      name: 'Waiting for backend core',
      status: 'MVP draft',
      expiry: 'Not assigned',
    },
    showQr: 'Show QR',
    moreActions: 'More actions',
  },
  subscriptions: {
    title: 'Subscriptions',
    description:
      'Config delivery with templates for the main VLESS/Xray clients on desktop and mobile.',
    outputTitle: 'Planned formats',
    outputSubtitle:
      'The backend will generate per-client links, QR payloads, and a subscription feed from transport templates.',
    items: [
      'Export a VLESS link with predictable naming.',
      'Issue a revocable subscription URL for each client.',
      'Provide step-by-step guides for Windows, macOS, Android, and iPhone/iPad.',
    ],
  },
  serverStatus: {
    title: 'Server status',
    description:
      'A dedicated area for Xray, API, database, disk, RAM, CPU, and safe runtime actions.',
    healthTitle: 'Service health',
    services: {
      api: 'API',
      apiStatus: 'Ready for health checks',
      xray: 'Xray',
      xrayStatus: 'Waiting for runtime probe',
      postgres: 'PostgreSQL',
      postgresStatus: 'Waiting for container startup',
    },
    intentTitle: 'Operations intent',
    intentItems: [
      'Safe restart actions with mandatory audit logging.',
      'Clear statuses without dumping raw internals by default.',
      'One page for confident operations and first-line incident triage.',
    ],
  },
  logs: {
    title: 'Logs',
    description:
      'Planned operator-friendly views for API events, Xray failures, and filtered system diagnostics.',
    directionTitle: 'Logs UX direction',
    items: [
      'Structured log stream with level filters.',
      'Short retention in the panel and long retention in rotated host files.',
      'Fast jump from a client card to related system events.',
    ],
  },
  backups: {
    title: 'Backups',
    description:
      'The database and rendered Xray state are backed up together so restore stays consistent.',
    designTitle: 'Restore model',
    items: [
      'Backup metadata is stored in PostgreSQL for visibility and audit.',
      'Restore validates checksum, unpacks artifacts, and restarts services in order.',
      'Retention stays operator-configurable and script-driven.',
    ],
  },
  settings: {
    title: 'Settings',
    description:
      'Platform settings stay narrow, explicit, and safe to change on a live single-node server.',
    scopeTitle: 'Settings scope',
    items: [
      'Default transport profile and public host parameters.',
      'Panel security profile and session lifetimes.',
      'Backup retention and optional notification integrations.',
    ],
  },
  help: {
    title: 'Help',
    description:
      'Practical instructions for issuing clients, importing configs, backups, and basic diagnostics.',
  },
  adminUsers: {
    title: 'Admin users',
    description:
      'Role-based admin access with auditability is part of the MVP foundation even before 2FA was enabled.',
    modelTitle: 'Planned access model',
    items: [
      'Super admin, operator, and read-only roles.',
      'Revocable refresh sessions for every device and browser.',
      'Reserved data model for future TOTP rollout.',
    ],
  },
  auditLog: {
    title: 'Audit log',
    description:
      'Key operator actions stay visible and searchable without turning the UI into a noisy SIEM.',
    trackedTitle: 'Tracked events',
    items: [
      'Successful and failed sign-ins.',
      'Client create, update, suspend, delete, and reset actions.',
      'Backup, restore, Xray reload, and settings changes.',
    ],
  },
};
