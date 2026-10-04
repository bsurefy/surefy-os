// SPDX-License-Identifier: AGPL-3.0-only
import { PERMISSIONS } from '@surefy/contracts'

import {
  cancelDataRequestRoute,
  createDataRequestRoute,
  createExportRoute,
  downloadDataRequestRoute,
  downloadExportRoute,
  getDataRequestRoute,
  getExportRoute,
  getRetentionRoute,
  listDataRequestsRoute,
  listExportsRoute,
  retryDataRequestRoute,
  retryExportRoute,
} from './dataControl.schema.js'

import type { DataControlController } from './dataControl.controller.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

/**
 * Data requests are read with `data-control:read`; creating, canceling, retrying and downloading
 * also need `data-control:export` or `data-control:delete`, which the service checks per request
 * type. Exports need `exports:use` plus the producing module's permission.
 */
export function dataControlRoutes(controller: DataControlController): FastifyPluginAsyncZod {
  return (app) => {
    const read = app.authorize(PERMISSIONS.DATA_CONTROL_READ)
    const exportsUse = app.authorize(PERMISSIONS.EXPORTS_USE)
    const requests = '/orgs/:orgId/data-requests'
    const exports = '/orgs/:orgId/exports'
    app.get(requests, { schema: listDataRequestsRoute, preHandler: read }, controller.listRequests)
    app.post(
      requests,
      { schema: createDataRequestRoute, preHandler: read },
      controller.createRequest,
    )
    app.get(
      `${requests}/:dataRequestId`,
      { schema: getDataRequestRoute, preHandler: read },
      controller.getRequest,
    )
    app.post(
      `${requests}/:dataRequestId/cancel`,
      { schema: cancelDataRequestRoute, preHandler: read },
      controller.cancelRequest,
    )
    app.post(
      `${requests}/:dataRequestId/retry`,
      { schema: retryDataRequestRoute, preHandler: read },
      controller.retryRequest,
    )
    app.post(
      `${requests}/:dataRequestId/download`,
      { schema: downloadDataRequestRoute, preHandler: read },
      controller.downloadRequest,
    )
    app.get(exports, { schema: listExportsRoute, preHandler: exportsUse }, controller.listExports)
    app.post(
      exports,
      { schema: createExportRoute, preHandler: exportsUse },
      controller.createExport,
    )
    app.get(
      `${exports}/:exportId`,
      { schema: getExportRoute, preHandler: exportsUse },
      controller.getExport,
    )
    app.post(
      `${exports}/:exportId/retry`,
      { schema: retryExportRoute, preHandler: exportsUse },
      controller.retryExport,
    )
    app.post(
      `${exports}/:exportId/download`,
      { schema: downloadExportRoute, preHandler: exportsUse },
      controller.downloadExport,
    )
    app.get(
      '/orgs/:orgId/data-control/retention',
      { schema: getRetentionRoute, preHandler: read },
      controller.retention,
    )
    return Promise.resolve()
  }
}
