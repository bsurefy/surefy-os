// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { installAdmins, installSettings } from '@/database/tables/index.js'
import {
  MailRejectedError,
  type MailMessage,
  type SmtpMailOptions,
} from '@/integrations/mail/index.js'
import {
  ERROR_CODES,
  installAdminDtoSchema,
  installOrganizationDtoSchema,
  installSettingsDtoSchema,
  meDtoSchema,
  signInOptionsDtoSchema,
} from '@surefy/contracts'

import { newId } from '../../../../test/factories/index.js'
import { setupTwoOrgs } from '../../../../test/helpers/orgSetup.js'
import {
  expectData,
  expectError,
  expectNoContent,
  expectPage,
  request,
} from '../../../../test/helpers/request.js'
import { createInstallModule, createInstallSettings } from '../install.module.js'

// Each test closes its app, so the parallel test files stay under the database's connection limit.
const opened: (() => Promise<void>)[] = []
afterEach(async () => {
  await Promise.all(opened.splice(0).map((close) => close()))
})

const SMTP = {
  host: 'smtp.example.test',
  port: 587,
  secure: false,
  username: 'mailer',
  fromAddress: 'ai@example.test',
  fromName: 'Acme AI',
}
const SMTP_PASSWORD = 'smtp-test-password'

/** Two organizations; A's Owner (olivia) administers the install. */
async function setup() {
  const context = await setupTwoOrgs()
  opened.push(() => context.close())
  await context.db.global
    .insert(installAdmins)
    .values({ userId: context.a.members.olivia.id, grantedByUserId: null })
  return { ...context, admin: context.sessionOf(context.a.members.olivia) }
}

describe('install routes guard', () => {
  it('answers 401 without a session and 403 to anyone who is not an install administrator', async () => {
    const { app, b, sessionOf } = await setup()
    expectError(
      await request(app, 'GET', '/api/v1/install/settings'),
      401,
      ERROR_CODES.AUTH_UNAUTHENTICATED,
    )
    expectError(
      await request(app, 'GET', '/api/v1/install/settings', { headers: sessionOf(b.members.bea) }),
      403,
      ERROR_CODES.INSTALL_ADMIN_REQUIRED,
    )
  })

  it('reports install administration on /me', async () => {
    const { app, admin } = await setup()
    const me = expectData(
      await request(app, 'GET', '/api/v1/me', { headers: admin }),
      200,
      meDtoSchema,
    )
    expect(me.isInstallAdmin).toBe(true)
  })
})

describe('GET/PATCH /install/settings', () => {
  it('returns the defaults with the organization count and limit', async () => {
    const { app, admin } = await setup()
    const settings = expectData(
      await request(app, 'GET', '/api/v1/install/settings', { headers: admin }),
      200,
      installSettingsDtoSchema,
    )
    expect(settings).toMatchObject({
      setupCompletedAt: null,
      signupPolicy: 'invite_only',
      orgCreationPolicy: 'install_admins',
      organizations: { count: 2, max: 1 },
      signIn: {
        emailPassword: true,
        oauth: { google: { enabled: false, configured: false } },
      },
      smtp: null,
      webSearch: { searxngUrl: null },
      version: { latest: null },
    })
  })

  it('opens sign-up for the sign-in screens', async () => {
    const { app, admin } = await setup()
    const updated = expectData(
      await request(app, 'PATCH', '/api/v1/install/settings', {
        headers: admin,
        payload: { signupPolicy: 'open', signIn: { oauth: { github: true } } },
      }),
      200,
      installSettingsDtoSchema,
    )
    expect(updated.signupPolicy).toBe('open')
    expect(updated.signIn.oauth.github).toEqual({ enabled: true, configured: false })
    const options = expectData(
      await request(app, 'GET', '/api/v1/auth/options'),
      200,
      signInOptionsDtoSchema,
    )
    expect(options.signupOpen).toBe(true)
  })

  it('stores the SMTP password encrypted and keeps it until it is cleared', async () => {
    const { app, admin, db } = await setup()
    const send = (payload: unknown) =>
      request(app, 'PATCH', '/api/v1/install/settings', { headers: admin, payload })

    const withPassword = expectData(
      await send({ smtp: { ...SMTP, password: SMTP_PASSWORD } }),
      200,
      installSettingsDtoSchema,
    )
    expect(withPassword.smtp).toEqual({ ...SMTP, passwordSet: true })
    const [row] = await db.global.select().from(installSettings)
    expect(row?.smtpPasswordCiphertext?.toString('utf8')).not.toContain(SMTP_PASSWORD)
    expect(row?.dataKeyWrapped).toBeInstanceOf(Buffer)

    const kept = expectData(
      await send({ smtp: { ...SMTP, host: 'mail.example.test' } }),
      200,
      installSettingsDtoSchema,
    )
    expect(kept.smtp).toMatchObject({ host: 'mail.example.test', passwordSet: true })

    const cleared = expectData(
      await send({ smtp: { ...SMTP, password: null } }),
      200,
      installSettingsDtoSchema,
    )
    expect(cleared.smtp?.passwordSet).toBe(false)
    const off = expectData(await send({ smtp: null }), 200, installSettingsDtoSchema)
    expect(off.smtp).toBeNull()
  })

  it('lets anyone create organizations under any_user, still within the limit', async () => {
    const { app, admin, b, sessionOf } = await setup()
    const create = () =>
      request(app, 'POST', '/api/v1/organizations', {
        headers: sessionOf(b.members.bea),
        payload: { name: 'Bea Second', slug: 'bea-second' },
      })
    expectError(await create(), 403, ERROR_CODES.ORGANIZATION_CREATION_NOT_ALLOWED)
    await request(app, 'PATCH', '/api/v1/install/settings', {
      headers: admin,
      payload: { orgCreationPolicy: 'any_user' },
    })
    expectError(await create(), 403, ERROR_CODES.LIMIT_REACHED)
  })
})

describe('POST /install/smtp/test', () => {
  it('refuses without SMTP settings', async () => {
    const { app, admin } = await setup()
    expectError(
      await request(app, 'POST', '/api/v1/install/smtp/test', {
        headers: admin,
        payload: { to: 'olivia@example.test' },
      }),
      409,
      ERROR_CODES.INSTALL_SMTP_NOT_CONFIGURED,
    )
  })

  it('sends one message with the stored settings and the decrypted password', async () => {
    const { app, admin, container, config, db } = await setup()
    await request(app, 'PATCH', '/api/v1/install/settings', {
      headers: admin,
      payload: { smtp: { ...SMTP, password: SMTP_PASSWORD } },
    })
    const sent: { options: SmtpMailOptions; message: MailMessage }[] = []
    let fail = false
    const install = createInstallModule({
      config,
      db,
      settings: createInstallSettings({ db }),
      users: container.modules.auth.users,
      logos: container.modules.organizations.service,
      smtpTestMailer: (options) => ({
        driver: 'smtp',
        send: (message) => {
          if (fail) return Promise.reject(new MailRejectedError(550))
          sent.push({ options, message })
          return Promise.resolve()
        },
        close: () => Promise.resolve(),
      }),
    })
    await install.service.sendTestEmail({ to: 'olivia@example.test' })
    expect(sent).toHaveLength(1)
    expect(sent[0]?.options).toEqual({
      from: '"Acme AI" <ai@example.test>',
      smtp: {
        host: SMTP.host,
        port: SMTP.port,
        secure: false,
        user: 'mailer',
        password: SMTP_PASSWORD,
      },
    })
    expect(sent[0]?.message.to).toBe('olivia@example.test')

    fail = true
    await expect(
      install.service.sendTestEmail({ to: 'olivia@example.test' }),
    ).rejects.toMatchObject({ code: ERROR_CODES.INSTALL_SMTP_TEST_FAILED, statusCode: 502 })
  })
})

describe('install administrators', () => {
  it('lists, adds and removes administrators; at least one remains', async () => {
    const { app, admin, a } = await setup()
    const { olivia, uma } = a.members
    const listed = expectData(
      await request(app, 'GET', '/api/v1/install/admins', { headers: admin }),
      200,
      z.array(installAdminDtoSchema),
    )
    expect(listed.map((row) => row.user.id)).toEqual([olivia.id])

    const added = expectData(
      await request(app, 'POST', '/api/v1/install/admins', {
        headers: admin,
        payload: { userId: uma.id },
      }),
      201,
      installAdminDtoSchema,
    )
    expect(added).toMatchObject({ user: { id: uma.id }, grantedByUserId: olivia.id })
    expectError(
      await request(app, 'POST', '/api/v1/install/admins', {
        headers: admin,
        payload: { userId: uma.id },
      }),
      409,
      ERROR_CODES.INSTALL_ADMIN_EXISTS,
    )
    expectError(
      await request(app, 'POST', '/api/v1/install/admins', {
        headers: admin,
        payload: { userId: newId() },
      }),
      404,
      ERROR_CODES.NOT_FOUND,
    )

    expectNoContent(
      await request(app, 'DELETE', `/api/v1/install/admins/${uma.id}`, { headers: admin }),
    )
    expectError(
      await request(app, 'DELETE', `/api/v1/install/admins/${uma.id}`, { headers: admin }),
      404,
      ERROR_CODES.NOT_FOUND,
    )
    expectError(
      await request(app, 'DELETE', `/api/v1/install/admins/${olivia.id}`, { headers: admin }),
      409,
      ERROR_CODES.INSTALL_LAST_ADMIN,
    )
  })
})

describe('GET /install/organizations', () => {
  it('lists every organization with its active member count, page by page', async () => {
    const { app, admin, a, b } = await setup()
    const all = expectPage(
      await request(app, 'GET', '/api/v1/install/organizations', { headers: admin }),
      installOrganizationDtoSchema,
    )
    expect(all.nextCursor).toBeNull()
    const counts = Object.fromEntries(all.data.map((org) => [org.id, org.memberCount]))
    expect(counts).toEqual({ [a.id]: 3, [b.id]: 1 })

    const first = expectPage(
      await request(app, 'GET', '/api/v1/install/organizations', {
        headers: admin,
        query: { limit: '1' },
      }),
      installOrganizationDtoSchema,
    )
    expect(first.data).toHaveLength(1)
    expect(first.nextCursor).not.toBeNull()
    const second = expectPage(
      await request(app, 'GET', '/api/v1/install/organizations', {
        headers: admin,
        query: { limit: '1', cursor: first.nextCursor ?? '' },
      }),
      installOrganizationDtoSchema,
    )
    expect(second.data.map((org) => org.id)).not.toContain(first.data[0]?.id)
    expect(second.nextCursor).toBeNull()
  })
})
