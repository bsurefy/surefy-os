// SPDX-License-Identifier: AGPL-3.0-only
import {
  auditEntryDtoSchema,
  auditIntegrityStatusDtoSchema,
  ERROR_CODES,
  okResponse,
  pageResponse,
  PAGE_SIZE,
} from '@surefy/contracts'
import type { AuditEntryDto, AuditIntegrityStatusDto } from '@surefy/contracts'
import { defineFactory, fixtureUuid } from '@surefy/web-core/testing'
import {
  defineMockDomain,
  defineMockHandler,
  mockError,
  mockOk,
  mockPage,
} from '@surefy/web-core/testing/mock'

import { MAYA, OMAR } from './shell.fixtures'
import { ANA } from './teams'

const ENTRY_KIND = 43
const TARGET_KIND = 42
const HTTP_NOT_FOUND = 404
const HTTP_CONFLICT = 409
const SUPPORT_TRIAGE_AGENT = fixtureUuid(TARGET_KIND, 1)

/** The newest seeded entry, not sealed yet ("Sealing…"). */
export const UNSEALED_ENTRY_ID = fixtureUuid(ENTRY_KIND, 99)

const hash = (seed: number) => seed.toString(16).padStart(2, '0').repeat(32)

/** A sealed, successful change by Maya, unless overridden; `sequence` is its place in the chain. */
export const auditEntryFactory = defineFactory(auditEntryDtoSchema, (sequence): AuditEntryDto => ({
  id: fixtureUuid(ENTRY_KIND, sequence),
  actor: { type: 'user', userId: MAYA.id, apiKeyId: null, refId: null, name: MAYA.name },
  via: 'user',
  accessGrantId: null,
  partnerId: null,
  action: 'organization.updated',
  targetType: 'organization',
  targetId: null,
  targetLabel: null,
  outcome: 'success',
  metadata: { version: 1 },
  reason: null,
  modelKey: null,
  confidence: null,
  requestId: `req_${String(sequence).padStart(6, '0')}`,
  ip: '203.0.113.24',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) Firefox/140.0',
  integrity: {
    entryHash: hash(sequence),
    chainSeq: sequence,
    chainHash: hash(sequence + 100),
    sealedAt: '2026-01-15T09:01:00.000Z',
  },
  createdAt: '2026-01-15T09:00:00.000Z',
}))

const userActor = (person: { id: string; name: string }) => ({
  type: 'user' as const,
  userId: person.id,
  apiKeyId: null,
  refId: null,
  name: person.name,
})

/** Oldest first, as the chain grows; the list answers newest first. */
function seedEntries(): AuditEntryDto[] {
  auditEntryFactory.reset()
  return [
    auditEntryFactory({
      action: 'organization.created',
      targetLabel: 'Acme Logistics',
      createdAt: '2026-01-02T09:00:00.000Z',
    }),
    auditEntryFactory({
      actor: userActor(ANA),
      action: 'team.created',
      targetType: 'team',
      targetId: fixtureUuid(TARGET_KIND, 2),
      targetLabel: 'Support',
      createdAt: '2026-01-05T10:30:00.000Z',
    }),
    auditEntryFactory({
      actor: { type: 'system', userId: null, apiKeyId: null, refId: null, name: null },
      via: 'system',
      action: 'audit.verified',
      targetType: 'audit_log',
      ip: null,
      userAgent: null,
      requestId: null,
      metadata: { version: 1, counts: { entries: 2 } },
      createdAt: '2026-01-08T02:00:00.000Z',
    }),
    auditEntryFactory({
      actor: userActor(OMAR),
      action: 'install.settings_updated',
      targetType: 'install',
      outcome: 'denied',
      reason: 'Needs the install administrator role',
      createdAt: '2026-01-10T14:12:00.000Z',
    }),
    auditEntryFactory({
      actor: {
        type: 'agent',
        userId: null,
        apiKeyId: null,
        refId: SUPPORT_TRIAGE_AGENT,
        name: 'Support triage',
      },
      via: 'system',
      action: 'ticket.replied',
      targetType: 'ticket',
      targetId: fixtureUuid(TARGET_KIND, 3),
      targetLabel: 'Ticket #4182',
      modelKey: 'openai/gpt-5-mini',
      confidence: 0.92,
      ip: null,
      userAgent: null,
      metadata: { version: 1, refs: { flowRunId: fixtureUuid(TARGET_KIND, 4) } },
      createdAt: '2026-01-12T16:45:00.000Z',
    }),
    auditEntryFactory({
      action: 'export.requested',
      targetType: 'export',
      outcome: 'failed',
      metadata: { version: 1, codes: ['EXPORT_TOO_LARGE'] },
      createdAt: '2026-01-14T11:20:00.000Z',
    }),
    auditEntryFactory({
      action: 'member.invited',
      targetType: 'invitation',
      targetId: fixtureUuid(TARGET_KIND, 5),
      targetLabel: 'priya@acme.test',
      metadata: { version: 1, labels: { role: 'builder' } },
      createdAt: '2026-01-14T09:00:00.000Z',
    }),
    // the newest one has not joined the chain yet: "Sealing…"
    auditEntryFactory({
      id: UNSEALED_ENTRY_ID,
      action: 'member.role_changed',
      targetType: 'member',
      targetId: fixtureUuid(TARGET_KIND, 6),
      targetLabel: OMAR.name,
      metadata: { version: 1, changes: [{ field: 'role', from: 'user', to: 'builder' }] },
      integrity: { entryHash: hash(8), chainSeq: null, chainHash: null, sealedAt: null },
      createdAt: '2026-01-15T08:55:00.000Z',
    }),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

let entries = seedEntries()

/** Back to the seeded log; tests call it between cases. */
export function resetAuditMock(): void {
  entries = seedEntries()
}

function integrityStatus(
  overrides: Partial<AuditIntegrityStatusDto> = {},
): AuditIntegrityStatusDto {
  const sealed = entries.filter((entry) => entry.integrity.chainSeq !== null)
  return {
    state: 'ok',
    sealedCount: sealed.length,
    unsealedCount: entries.length - sealed.length,
    lastSealedAt: '2026-01-15T09:01:00.000Z',
    lastVerifiedAt: '2026-01-15T02:00:00.000Z',
    mismatch: null,
    lastSignedCheckpointAt: null,
    ...overrides,
  }
}

function matches(entry: AuditEntryDto, params: URLSearchParams): boolean {
  const q = params.get('q')?.toLowerCase()
  const from = params.get('from')
  const to = params.get('to')
  const equals = (key: string, value: string | null) => {
    const wanted = params.get(key)
    return wanted === null || wanted === value
  }
  return (
    (!q ||
      [entry.action, entry.actor.name, entry.targetLabel].some((text) =>
        text?.toLowerCase().includes(q),
      )) &&
    equals('actorType', entry.actor.type) &&
    equals('actorUserId', entry.actor.userId) &&
    equals('action', entry.action) &&
    equals('targetType', entry.targetType) &&
    equals('outcome', entry.outcome) &&
    (!from || entry.createdAt >= from) &&
    (!to || entry.createdAt < to)
  )
}

const path = '/orgs/:orgId/audit'
const entryNotFound = () =>
  mockError(HTTP_NOT_FOUND, ERROR_CODES.AUDIT_ENTRY_NOT_FOUND, 'Audit entry not found')

/**
 * The audit log (B2-05's routes) until the integration task switches to the real API. Scenarios:
 * `empty` is a fresh install; `integrity-mismatch` reports an entry that no longer matches its
 * chain; `integrity-unverified` has never been checked; `verification-running` refuses a second
 * check with `AUDIT_VERIFICATION_RUNNING`.
 */
export const auditDomain = defineMockDomain('audit', [
  defineMockHandler({
    method: 'get',
    path: `${path}/entries`,
    response: pageResponse(auditEntryDtoSchema),
    scenarios: {
      default: ({ request }) => {
        const url = new URL(request.url)
        const found = entries.filter((entry) => matches(entry, url.searchParams))
        const limit = Number(url.searchParams.get('limit') ?? PAGE_SIZE.default)
        const start = Number(url.searchParams.get('cursor') ?? 0)
        const next = start + limit < found.length ? String(start + limit) : null
        return mockPage(found.slice(start, start + limit), next)
      },
    },
  }),
  defineMockHandler({
    method: 'get',
    path: `${path}/entries/:entryId`,
    response: okResponse(auditEntryDtoSchema),
    scenarios: {
      default: ({ params }) => {
        const found = entries.find((entry) => entry.id === params.entryId)
        return found ? mockOk(found) : entryNotFound()
      },
    },
  }),
  defineMockHandler({
    method: 'get',
    path: `${path}/integrity`,
    response: okResponse(auditIntegrityStatusDtoSchema),
    scenarios: {
      default: () => mockOk(integrityStatus()),
      'integrity-mismatch': () => {
        const broken = entries.find((entry) => entry.action === 'install.settings_updated')
        return mockOk(
          integrityStatus({
            state: 'mismatch',
            mismatch: broken?.integrity.chainSeq
              ? { entryId: broken.id, chainSeq: broken.integrity.chainSeq }
              : null,
          }),
        )
      },
      'integrity-unverified': () =>
        mockOk(integrityStatus({ state: 'unverified', lastVerifiedAt: null })),
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${path}/verify`,
    response: okResponse(auditIntegrityStatusDtoSchema),
    scenarios: {
      default: () =>
        mockOk(integrityStatus({ lastVerifiedAt: new Date().toISOString() }), { status: 202 }),
      'verification-running': () =>
        mockError(
          HTTP_CONFLICT,
          ERROR_CODES.AUDIT_VERIFICATION_RUNNING,
          'A verification is already running',
        ),
    },
  }),
])
