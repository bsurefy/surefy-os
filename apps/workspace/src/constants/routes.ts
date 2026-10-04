// SPDX-License-Identifier: AGPL-3.0-only
// Every path of the workspace (pages-routing.md §1, design/workspace/navigation.md §1). Code never
// writes a path inline: it calls these builders. Lanes use them and never edit this file.

/** Settings sections: `/[orgSlug]/settings/[section]`, in the order of the settings navigation. */
export const SETTINGS_SECTION = {
  GENERAL: 'general',
  MEMBERS: 'members',
  TEAMS: 'teams',
  ACCESS: 'access',
  VAULT: 'vault',
  USAGE: 'usage',
  DATA_PRIVACY: 'data-privacy',
  SECURITY: 'security',
  BRANDING: 'branding',
  BILLING: 'billing',
  INSTALL: 'install',
  LICENSE: 'license',
} as const
export type SettingsSection = (typeof SETTINGS_SECTION)[keyof typeof SETTINGS_SECTION]

const INVITE_PATH = '/invite'

// Builders return template literal types (`/${string}/chat`), so `<Link href>` and `router.push`
// accept them under `typedRoutes` once the page exists.
export const ROUTES = {
  /** Redirects to the last-used organization, or to the organization picker. */
  root: '/',
  auth: {
    login: '/login',
    signup: '/signup',
    verifyEmail: '/verify-email',
    twoFactor: '/two-factor',
    twoFactorSetup: '/two-factor/setup',
    forgotPassword: '/forgot-password',
    resetPassword: '/reset-password',
    invite: (token: string) => `${INVITE_PATH}/${token}` as const,
    /** Signed in, no organization chosen: the organization picker. */
    organizations: '/organizations',
    /** Signed in, member of no organization. */
    noOrganization: '/no-organization',
    /** Self-host first run, before the first organization exists. */
    setup: '/setup',
  },
  workspace: {
    /** Where an organization opens: Chat. */
    home: (orgSlug: string) => `/${orgSlug}/chat` as const,
    chat: (orgSlug: string, chatId?: string) =>
      chatId ? (`/${orgSlug}/chat/${chatId}` as const) : (`/${orgSlug}/chat` as const),
    agents: (orgSlug: string) => `/${orgSlug}/agents` as const,
    agentNew: (orgSlug: string) => `/${orgSlug}/agents/new` as const,
    agent: (orgSlug: string, agentId: string, tab?: string) =>
      tab
        ? (`/${orgSlug}/agents/${agentId}/${tab}` as const)
        : (`/${orgSlug}/agents/${agentId}` as const),
    flows: (orgSlug: string) => `/${orgSlug}/flows` as const,
    flow: (orgSlug: string, flowId: string) => `/${orgSlug}/flows/${flowId}` as const,
    pieces: (orgSlug: string, tab?: string) =>
      tab ? (`/${orgSlug}/pieces/${tab}` as const) : (`/${orgSlug}/pieces` as const),
    piece: (orgSlug: string, pieceId: string) => `/${orgSlug}/pieces/${pieceId}` as const,
    knowledge: (orgSlug: string) => `/${orgSlug}/knowledge` as const,
    knowledgeBase: (orgSlug: string, kbId: string, tab?: string) =>
      tab
        ? (`/${orgSlug}/knowledge/${kbId}/${tab}` as const)
        : (`/${orgSlug}/knowledge/${kbId}` as const),
    train: (orgSlug: string) => `/${orgSlug}/train` as const,
    trainJob: (orgSlug: string, jobId: string) => `/${orgSlug}/train/${jobId}` as const,
    insights: (orgSlug: string, tab?: string) =>
      tab ? (`/${orgSlug}/insights/${tab}` as const) : (`/${orgSlug}/insights` as const),
    run: (orgSlug: string, runId: string) => `/${orgSlug}/insights/runs/${runId}` as const,
    approval: (orgSlug: string, approvalId: string) =>
      `/${orgSlug}/insights/approvals/${approvalId}` as const,
    guard: (orgSlug: string, tab?: string) =>
      tab ? (`/${orgSlug}/guard/${tab}` as const) : (`/${orgSlug}/guard` as const),
    settings: (orgSlug: string, section?: SettingsSection) =>
      section ? (`/${orgSlug}/settings/${section}` as const) : (`/${orgSlug}/settings` as const),
    vault: (orgSlug: string, tab?: string) =>
      tab
        ? (`/${orgSlug}/settings/vault/${tab}` as const)
        : (`/${orgSlug}/settings/vault` as const),
    notifications: (orgSlug: string) => `/${orgSlug}/notifications` as const,
    profile: (orgSlug: string) => `/${orgSlug}/profile` as const,
  },
  dev: {
    /** The design-system showcase; answers 404 in production builds. */
    ui: '/ui',
  },
} as const

/**
 * Path prefixes the session proxy lets through without a session; each also covers everything
 * below it (`/two-factor/setup`, `/invite/<token>`). The organization picker and every
 * organization page need a session.
 */
export const PUBLIC_PATHS = [
  ROUTES.auth.login,
  ROUTES.auth.signup,
  ROUTES.auth.verifyEmail,
  ROUTES.auth.twoFactor,
  ROUTES.auth.forgotPassword,
  ROUTES.auth.resetPassword,
  ROUTES.auth.setup,
  INVITE_PATH,
  ROUTES.dev.ui,
] as const
