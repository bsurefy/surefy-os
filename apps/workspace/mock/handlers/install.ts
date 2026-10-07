// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import {
  ERROR_CODES,
  installAdminDtoSchema,
  installOrganizationDtoSchema,
  installSettingsDtoSchema,
  okResponse,
  pageResponse,
  sendTestEmailInputSchema,
  updateInstallSettingsInputSchema,
} from '@surefy/contracts'
import type {
  InstallAdminDto,
  InstallSettingsDto,
  UpdateInstallSettingsInput,
} from '@surefy/contracts'
import { fixtureUuid } from '@surefy/web-core/testing'
import {
  defineMockDomain,
  defineMockHandler,
  mockError,
  mockOk,
  mockPage,
} from '@surefy/web-core/testing/mock'

import { ACME_ORG, MAYA, OMAR } from './shell.fixtures'

const HTTP_CONFLICT = 409
const HTTP_BAD_GATEWAY = 502
const NOW = '2026-01-15T09:00:00.000Z'

function seedSettings(): InstallSettingsDto {
  return {
    installationId: fixtureUuid(50, 1),
    version: { current: '1.0.0', latest: null },
    setupCompletedAt: '2026-01-02T09:00:00.000Z',
    signupPolicy: 'invite_only',
    orgCreationPolicy: 'install_admins',
    organizations: { count: 1, max: 1 },
    signIn: {
      emailPassword: true,
      oauth: {
        google: { enabled: false, configured: false },
        microsoft: { enabled: false, configured: false },
        github: { enabled: true, configured: true },
      },
    },
    smtp: null,
    webSearch: { searxngUrl: null },
    updatedAt: NOW,
  }
}

const seedAdmins = (): InstallAdminDto[] => [
  { user: MAYA, grantedByUserId: null, createdAt: '2026-01-02T09:00:00.000Z' },
]

let settings = seedSettings()
let admins = seedAdmins()

/** Back to the seeded install; tests call it between cases. */
export function resetInstallMock(): void {
  settings = seedSettings()
  admins = seedAdmins()
}

function applyUpdate(input: UpdateInstallSettingsInput): InstallSettingsDto {
  const { smtp, signIn, ...rest } = input
  const oauth = { ...settings.signIn.oauth }
  for (const [provider, enabled] of Object.entries(signIn?.oauth ?? {})) {
    const key = provider as keyof typeof oauth
    oauth[key] = { ...oauth[key], enabled }
  }
  let nextSmtp = settings.smtp
  if (smtp === null) nextSmtp = null
  else if (smtp) {
    const { password, ...fields } = smtp
    nextSmtp = {
      ...fields,
      passwordSet:
        password === undefined ? (settings.smtp?.passwordSet ?? false) : password !== null,
    }
  }
  return {
    ...settings,
    ...rest,
    signIn: { emailPassword: signIn?.emailPassword ?? settings.signIn.emailPassword, oauth },
    smtp: nextSmtp,
    updatedAt: NOW,
  }
}

/**
 * Install settings, administrators and the organizations on the install (B2-02's routes), live on
 * the real API (I4-02; the handlers stay for component tests and for `MOCK_DOMAINS=install`, to
 * look at the states). Scenarios: `update-available` and `over-limit` change the settings answer;
 * `smtp-failed` makes the test email fail with the server's refusal.
 */
export const installDomain = defineMockDomain(
  'install',
  [
    defineMockHandler({
      method: 'get',
      path: '/install/settings',
      response: okResponse(installSettingsDtoSchema),
      scenarios: {
        default: () => mockOk(settings),
        'update-available': () =>
          mockOk({ ...settings, version: { current: '1.0.0', latest: '1.1.0' } }),
        'over-limit': () => mockOk({ ...settings, organizations: { count: 3, max: 1 } }),
      },
    }),
    defineMockHandler({
      method: 'patch',
      path: '/install/settings',
      response: okResponse(installSettingsDtoSchema),
      scenarios: {
        default: async ({ request }) => {
          settings = applyUpdate(updateInstallSettingsInputSchema.parse(await request.json()))
          return mockOk(settings)
        },
      },
    }),
    defineMockHandler({
      method: 'post',
      path: '/install/smtp/test',
      response: okResponse(z.null()),
      scenarios: {
        default: async ({ request }) => {
          sendTestEmailInputSchema.parse(await request.json())
          if (!settings.smtp) {
            return mockError(HTTP_CONFLICT, ERROR_CODES.INSTALL_SMTP_NOT_CONFIGURED, 'No SMTP')
          }
          return new Response(null, { status: 204 })
        },
        'smtp-failed': () =>
          mockError(HTTP_BAD_GATEWAY, ERROR_CODES.INSTALL_SMTP_TEST_FAILED, 'Refused'),
      },
    }),
    defineMockHandler({
      method: 'get',
      path: '/install/admins',
      response: pageResponse(installAdminDtoSchema),
      scenarios: { default: () => mockPage(admins) },
    }),
    defineMockHandler({
      method: 'post',
      path: '/install/admins',
      response: okResponse(installAdminDtoSchema),
      scenarios: {
        default: async ({ request }) => {
          const { userId } = (await request.json()) as { userId: string }
          if (admins.some((admin) => admin.user.id === userId)) {
            return mockError(HTTP_CONFLICT, ERROR_CODES.INSTALL_ADMIN_EXISTS, 'Already an admin')
          }
          const user = [MAYA, OMAR].find((person) => person.id === userId)
          if (!user) return mockError(404, ERROR_CODES.NOT_FOUND, 'No such person')
          const created = { user, grantedByUserId: MAYA.id, createdAt: NOW }
          admins = [...admins, created]
          return mockOk(created, { status: 201 })
        },
      },
    }),
    defineMockHandler({
      method: 'delete',
      path: '/install/admins/:userId',
      response: okResponse(z.null()),
      scenarios: {
        default: ({ params }) => {
          if (admins.length === 1) {
            return mockError(HTTP_CONFLICT, ERROR_CODES.INSTALL_LAST_ADMIN, 'Last admin')
          }
          admins = admins.filter((admin) => admin.user.id !== params.userId)
          return new Response(null, { status: 204 })
        },
      },
    }),
    defineMockHandler({
      method: 'get',
      path: '/install/organizations',
      response: pageResponse(installOrganizationDtoSchema),
      scenarios: {
        default: () =>
          mockPage([{ ...ACME_ORG, memberCount: 4, createdAt: '2026-01-02T09:00:00.000Z' }]),
      },
    }),
  ],
  { isLive: true },
)
