// SPDX-License-Identifier: AGPL-3.0-only
import {
  createDataRequestInputSchema,
  dataRequestDtoSchema,
  dataRetentionDtoSchema,
  downloadLinkDtoSchema,
  ERROR_CODES,
  okResponse,
  pageResponse,
} from '@surefy/contracts'
import type { DataRequestDto } from '@surefy/contracts'
import { defineFactory, fixtureUuid } from '@surefy/web-core/testing'
import {
  defineMockDomain,
  defineMockHandler,
  mockError,
  mockOk,
  mockPage,
} from '@surefy/web-core/testing/mock'

import { MAYA } from './shell.fixtures'

const DATA_REQUEST_KIND = 40
const HTTP_CONFLICT = 409
const HTTP_FORBIDDEN = 403
const HTTP_NOT_FOUND = 404
const DAY_MS = 86_400_000
const NOW = '2026-01-15T09:00:00.000Z'

/** An export the Owner asked for, ready to download, unless overridden. */
export const dataRequestFactory = defineFactory(
  dataRequestDtoSchema,
  (sequence): DataRequestDto => ({
    id: fixtureUuid(DATA_REQUEST_KIND, sequence),
    type: 'export',
    status: 'ready',
    requestedVia: 'workspace',
    requestedBy: MAYA,
    reason: null,
    sizeBytes: 48_300_000,
    expiresAt: '2026-01-16T09:00:00.000Z',
    scheduledFor: null,
    errorCode: null,
    deliveredAt: null,
    canceledAt: null,
    canceledByUserId: null,
    createdAt: '2026-01-14T09:00:00.000Z',
    updatedAt: '2026-01-14T09:30:00.000Z',
  }),
)

let requests: DataRequestDto[] = []

/** Back to no requests; tests call it between cases. */
export function resetDataControlMock(): void {
  dataRequestFactory.reset()
  requests = []
}

const path = '/orgs/:orgId/data-requests'
const notFound = () =>
  mockError(HTTP_NOT_FOUND, ERROR_CODES.DATA_REQUEST_NOT_FOUND, 'Request not found')
const find = (id: unknown) => requests.find((request) => request.id === id)
const replace = (updated: DataRequestDto) => {
  requests = requests.map((request) => (request.id === updated.id ? updated : request))
  return updated
}

/**
 * Data requests and the retention overview (B2-06's routes) until the integration task (I4-02)
 * switches to the real API. A new export is `preparing` and turns `ready` on the next list.
 * Scenarios: `export-failed` lists a failed export; `deletion-pending` and `not-fresh` make a
 * deletion fail with its code; `region` and `retention-policies` change the retention answer.
 */
export const dataControlDomain = defineMockDomain('dataControl', [
  defineMockHandler({
    method: 'get',
    path,
    response: pageResponse(dataRequestDtoSchema),
    scenarios: {
      default: ({ request }) => {
        const type = new URL(request.url).searchParams.get('type')
        requests = requests.map((item) =>
          item.status === 'preparing' ? { ...item, status: 'ready', updatedAt: NOW } : item,
        )
        return mockPage(requests.filter((item) => !type || item.type === type))
      },
      'export-failed': () =>
        mockPage([
          dataRequestFactory({
            status: 'failed',
            sizeBytes: null,
            expiresAt: null,
            errorCode: 'EXPORT_FAILED',
          }),
        ]),
    },
  }),
  defineMockHandler({
    method: 'post',
    path,
    response: okResponse(dataRequestDtoSchema),
    scenarios: {
      default: async ({ request }) => {
        const input = createDataRequestInputSchema.parse(await request.json())
        if (
          input.type === 'deletion' &&
          requests.some((item) => item.type === 'deletion' && item.status === 'scheduled')
        ) {
          return mockError(HTTP_CONFLICT, ERROR_CODES.DATA_REQUEST_DELETION_PENDING, 'Pending')
        }
        const created =
          input.type === 'export'
            ? dataRequestFactory({ status: 'preparing', sizeBytes: null, expiresAt: null })
            : dataRequestFactory({
                type: 'deletion',
                status: 'scheduled',
                reason: input.reason,
                sizeBytes: null,
                expiresAt: null,
                scheduledFor: new Date(Date.parse(NOW) + 30 * DAY_MS).toISOString(),
              })
        requests = [created, ...requests]
        return mockOk(created, { status: 201 })
      },
      'deletion-pending': () =>
        mockError(HTTP_CONFLICT, ERROR_CODES.DATA_REQUEST_DELETION_PENDING, 'Pending'),
      'not-fresh': () =>
        mockError(HTTP_FORBIDDEN, ERROR_CODES.AUTH_SESSION_NOT_FRESH, 'Sign in again'),
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${path}/:requestId/cancel`,
    response: okResponse(dataRequestDtoSchema),
    scenarios: {
      default: ({ params }) => {
        const found = find(params.requestId)
        if (!found) return notFound()
        return mockOk(replace({ ...found, status: 'canceled', canceledAt: NOW }))
      },
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${path}/:requestId/retry`,
    response: okResponse(dataRequestDtoSchema),
    scenarios: {
      default: ({ params }) => {
        const found = find(params.requestId)
        if (!found) return notFound()
        return mockOk(replace({ ...found, status: 'preparing', errorCode: null }))
      },
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${path}/:requestId/download`,
    response: okResponse(downloadLinkDtoSchema),
    scenarios: {
      default: ({ params }) => {
        const found = find(params.requestId)
        if (!found) return notFound()
        return mockOk({
          url: 'http://localhost:4000/downloads/export.zip',
          fileName: 'acme-export.zip',
          contentType: 'application/zip',
          sizeBytes: found.sizeBytes,
          expiresAt: '2026-01-15T10:00:00.000Z',
        })
      },
    },
  }),
  defineMockHandler({
    method: 'get',
    path: '/orgs/:orgId/data-control/retention',
    response: okResponse(dataRetentionDtoSchema),
    scenarios: {
      default: () =>
        mockOk({
          region: null,
          items: [
            { key: 'chats', retentionDays: null, configurable: false },
            { key: 'audit_logs', retentionDays: 365, configurable: false },
            { key: 'usage_events', retentionDays: 730, configurable: false },
            { key: 'notifications', retentionDays: 90, configurable: false },
            { key: 'exports', retentionDays: 1, configurable: false },
            { key: 'deleted_items', retentionDays: 30, configurable: false },
          ],
        }),
      region: () =>
        mockOk({
          region: 'EU (Frankfurt)',
          items: [{ key: 'chats', retentionDays: 365, configurable: true }],
        }),
    },
  }),
])
