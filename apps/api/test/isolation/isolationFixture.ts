// SPDX-License-Identifier: AGPL-3.0-only
import { eq } from 'drizzle-orm'

import { QUEUES } from '@/constants/queues.js'
import { auditLogs, organizationPurges, organizationSlugHistory } from '@/database/tables/index.js'
import { notificationFactory } from '@/modules/notifications/__tests__/notificationsTestKit.js'
import {
  credentialDtoSchema,
  dataRequestDtoSchema,
  exportDtoSchema,
  invitationDtoSchema,
  teamDtoSchema,
  vaultModelDtoSchema,
} from '@surefy/contracts'

import { expectData, expectPage, request } from '../helpers/request.js'

import type { TwoOrgSetup } from '../helpers/orgSetup.js'
import type { SendEmailPayload } from '@/modules/notifications/index.js'

/** Organization A with one real resource of every kind a route can name, and B's Owner. */
export interface IsolationFixture {
  orgA: { id: string }
  orgB: { id: string; ownerId: string }
  /** A's real ids by path parameter name; a route with a parameter missing here fails loudly. */
  params: Readonly<Record<string, string>>
  /** A's ids and content that must never reach B (testing.md, §4, step 3). */
  markers: readonly string[]
}

const INVITEE = 'secret.invitee@example.test'
const VAULT_SECRET = 'sk-isolation-secret-of-acme-0042'

const tokenFromQueue = async (setup: TwoOrgSetup): Promise<string> => {
  const jobs = await setup.container.queues.get(QUEUES.EMAIL).getJobs(['waiting', 'delayed'])
  const sent = jobs
    .map((job) => job.data as SendEmailPayload)
    .find((payload) => payload.template === 'invitation' && payload.to === INVITEE)
  const token = sent?.template === 'invitation' ? sent.url.split('/invite/')[1] : undefined
  if (token === undefined || token === '') throw new Error('no invitation email queued')
  return token
}

/**
 * Seeds A through its own Owner, the way the product does: a team with Uma, a pending invitation
 * (and its link token), a notification for Uma, Olivia's member preferences and a retired slug.
 * Every tenant table then holds rows of A, which the database-layer check relies on.
 */
export async function seedIsolationFixture(setup: TwoOrgSetup): Promise<IsolationFixture> {
  const { app, a, b } = setup
  const { olivia, adam, uma } = a.members
  const headers = setup.sessionOf(olivia)
  const orgUrl = `/api/v1/orgs/${a.id}`

  const team = expectData(
    await request(app, 'POST', `${orgUrl}/teams`, {
      headers,
      payload: { name: 'Secret Lab', memberUserIds: [uma.id] },
    }),
    201,
    teamDtoSchema,
  )
  const invitation = expectData(
    await request(app, 'POST', `${orgUrl}/invitations`, {
      headers,
      payload: { email: INVITEE, role: 'user', teamIds: [team.id] },
    }),
    201,
    invitationDtoSchema,
  )
  const token = await tokenFromQueue(setup)
  const preferences = await request(app, 'PATCH', `${orgUrl}/members/me/preferences`, {
    headers,
    payload: { tableDensity: 'compact' },
  })
  if (preferences.statusCode !== 200) throw new Error(`preferences: ${preferences.body}`)
  const sessions = await request(app, 'GET', '/api/v1/me/sessions', { headers })
  const sessionId = sessions.json<{ data: { id: string }[] }>().data[0]?.id
  if (sessionId === undefined) throw new Error(`no session of Olivia: ${sessions.body}`)

  const notification = await setup.db.system('test', async (tx) => {
    await tx.insert(organizationSlugHistory).values({
      organizationId: a.id,
      slug: 'acme-research-old',
      redirectUntil: new Date(Date.now() + 86_400_000),
    })
    return notificationFactory.create(tx, { organizationId: a.id, userId: uma.id })
  })

  // Vault rows of A: a key (its data key and the provider's models with their access rules) and
  // a local server with its models; the settings row exists from the organization's creation.
  const vaultUrl = `${orgUrl}/vault`
  const credential = expectData(
    await request(app, 'POST', `${vaultUrl}/credentials`, {
      headers,
      payload: {
        scope: 'organization',
        name: 'Secret OpenAI',
        providerKey: 'openai',
        secret: VAULT_SECRET,
      },
    }),
    201,
    credentialDtoSchema,
  )
  const server = expectData(
    await request(app, 'POST', `${vaultUrl}/local-servers`, {
      headers,
      payload: {
        scope: 'organization',
        name: 'Secret Ollama',
        providerKey: 'ollama',
        baseUrl: 'http://ollama.secret-lab.test:11434',
      },
    }),
    201,
    credentialDtoSchema,
  )
  const [model] = expectPage(
    await request(app, 'GET', `${vaultUrl}/models`, { headers, query: { providerKey: 'openai' } }),
    vaultModelDtoSchema,
  ).data
  if (model === undefined) throw new Error('no vault model of A')

  // Access, audit and data control rows of A: a policy (and its audit entry), a full export
  // request, a background export, a sealed chain head and a purge record.
  const policy = await request(app, 'PUT', `${orgUrl}/access/policy`, {
    headers,
    payload: { version: 1, tools: { mcp: false } },
  })
  if (policy.statusCode !== 200) throw new Error(`access policy: ${policy.body}`)
  const dataRequest = expectData(
    await request(app, 'POST', `${orgUrl}/data-requests`, { headers, payload: { type: 'export' } }),
    201,
    dataRequestDtoSchema,
  )
  const dataExport = expectData(
    await request(app, 'POST', `${orgUrl}/exports`, {
      headers,
      payload: { kind: 'members_csv', params: { version: 1, format: 'csv' } },
    }),
    202,
    exportDtoSchema,
  )
  await setup.container.modules.audit.service.sealPending()
  const entryId = await setup.db.system('test', async (tx) => {
    await tx.insert(organizationPurges).values({
      organizationId: a.id,
      reason: 'owner_request',
      status: 'canceled',
      scheduledFor: new Date(),
    })
    const [entry] = await tx
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(eq(auditLogs.organizationId, a.id))
      .limit(1)
    if (entry === undefined) throw new Error('no audit entry of A')
    return entry.id
  })

  return {
    orgA: { id: a.id },
    orgB: { id: b.id, ownerId: b.members.bea.id },
    params: {
      memberId: uma.memberId,
      userId: uma.id,
      teamId: team.id,
      invitationId: invitation.id,
      notificationId: notification.id,
      sessionId,
      token,
      entryId,
      dataRequestId: dataRequest.id,
      exportId: dataExport.id,
      credentialId: credential.id,
      serverId: server.id,
      modelId: model.id,
    },
    markers: [
      a.id,
      'Acme Research',
      'acme-research-old',
      team.id,
      'Secret Lab',
      invitation.id,
      INVITEE,
      token,
      notification.id,
      sessionId,
      entryId,
      dataRequest.id,
      dataExport.id,
      credential.id,
      'Secret OpenAI',
      VAULT_SECRET,
      server.id,
      'Secret Ollama',
      'ollama.secret-lab.test',
      model.id,
      ...[olivia, adam, uma].flatMap((member) => [member.id, member.memberId, member.email]),
    ],
  }
}
