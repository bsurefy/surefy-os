// SPDX-License-Identifier: AGPL-3.0-only
import {
  createDataRequestInputSchema,
  createExportInputSchema,
  dataRequestDtoSchema,
  dataRetentionDtoSchema,
  downloadLinkDtoSchema,
  ERROR_CODES,
  exportDtoSchema,
  okResponse,
  pageResponse,
} from '@surefy/contracts'
import type { DataRequestDto, ExportDto } from '@surefy/contracts'
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
const EXPORT_KIND = 41
const HTTP_ACCEPTED = 202
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

/** A background export just accepted, still being prepared, unless overridden. */
export const exportFactory = defineFactory(exportDtoSchema, (sequence): ExportDto => ({
  id: fixtureUuid(EXPORT_KIND, sequence),
  kind: 'audit_csv',
  status: 'preparing',
  params: { version: 1, format: 'csv', filters: {} },
  containsPersonalData: true,
  fileName: null,
  contentType: null,
  sizeBytes: null,
  rowCount: null,
  attempts: 1,
  errorCode: null,
  expiresAt: null,
  downloadedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
}))

let requests: DataRequestDto[] = []
let exports: ExportDto[] = []

/** Back to no requests and no exports; tests call it between cases. */
export function resetDataControlMock(): void {
  dataRequestFactory.reset()
  exportFactory.reset()
  requests = []
  exports = []
}

function readyExport(found: ExportDto): ExportDto {
  const isJson = found.params.format === 'json'
  return {
    ...found,
    status: 'ready',
    fileName: `${found.kind.split('_')[0] ?? 'export'}-log.${isJson ? 'json' : 'csv'}`,
    contentType: isJson ? 'application/json' : 'text/csv',
    sizeBytes: 48_213,
    rowCount: 812,
    expiresAt: '2026-01-16T09:00:00.000Z',
    updatedAt: NOW,
  }
}

function failedExport(found: ExportDto): ExportDto {
  return { ...found, status: 'failed', errorCode: ERROR_CODES.INTERNAL_ERROR, updatedAt: NOW }
}

/** Each read moves a preparing export on, so polling ends at once in the mock. */
function advanceExport(id: unknown, finish: (found: ExportDto) => ExportDto) {
  const found = exports.find((item) => item.id === id)
  if (!found) return null
  const next = found.status === 'preparing' ? finish(found) : found
  exports = exports.map((item) => (item.id === found.id ? next : item))
  return next
}

const path = '/orgs/:orgId/data-requests'
const exportsPath = '/orgs/:orgId/exports'
const exportNotFound = () =>
  mockError(HTTP_NOT_FOUND, ERROR_CODES.EXPORT_NOT_FOUND, 'Export not found')
const notFound = () =>
  mockError(HTTP_NOT_FOUND, ERROR_CODES.DATA_REQUEST_NOT_FOUND, 'Request not found')
const find = (id: unknown) => requests.find((request) => request.id === id)
const replace = (updated: DataRequestDto) => {
  requests = requests.map((request) => (request.id === updated.id ? updated : request))
  return updated
}

/**
 * Data requests and the retention overview (B2-06's routes) until the integration task (I4-02)
 * switches to the real API, and the background exports other screens start (Guard › Audit log).
 * A new export is `preparing` and turns `ready` on the next read. Scenarios: `export-failed` lists
 * a failed data export and ends every background export in Failed; `deletion-pending` and
 * `not-fresh` make a
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
  defineMockHandler({
    method: 'post',
    path: exportsPath,
    response: okResponse(exportDtoSchema),
    scenarios: {
      default: async ({ request }) => {
        const input = createExportInputSchema.parse(await request.json())
        const created = exportFactory({ kind: input.kind, params: input.params })
        exports = [...exports, created]
        return mockOk(created, { status: HTTP_ACCEPTED })
      },
    },
  }),
  defineMockHandler({
    method: 'get',
    path: `${exportsPath}/:exportId`,
    response: okResponse(exportDtoSchema),
    scenarios: {
      default: ({ params }) => {
        const found = advanceExport(params.exportId, readyExport)
        return found ? mockOk(found) : exportNotFound()
      },
      'export-failed': ({ params }) => {
        const found = advanceExport(params.exportId, failedExport)
        return found ? mockOk(found) : exportNotFound()
      },
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${exportsPath}/:exportId/retry`,
    response: okResponse(exportDtoSchema),
    scenarios: {
      default: ({ params }) => {
        const found = exports.find((item) => item.id === params.exportId)
        if (!found) return exportNotFound()
        const retried: ExportDto = {
          ...found,
          status: 'preparing',
          errorCode: null,
          attempts: found.attempts + 1,
        }
        exports = exports.map((item) => (item.id === found.id ? retried : item))
        return mockOk(retried, { status: HTTP_ACCEPTED })
      },
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${exportsPath}/:exportId/download`,
    response: okResponse(downloadLinkDtoSchema),
    scenarios: {
      default: ({ params }) => {
        const found = exports.find((item) => item.id === params.exportId)
        if (found?.status !== 'ready' || !found.fileName) return exportNotFound()
        return mockOk({
          url: `https://files.acme.test/exports/${found.id}?signature=mock`,
          fileName: found.fileName,
          contentType: found.contentType ?? 'application/octet-stream',
          sizeBytes: found.sizeBytes,
          expiresAt: '2026-01-15T09:05:00.000Z',
        })
      },
    },
  }),
])
