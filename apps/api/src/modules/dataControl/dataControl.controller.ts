// SPDX-License-Identifier: AGPL-3.0-only
import type {
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
import type { DataControlService } from './dataControl.service.js'
import type { DataExportsService } from './dataExports/dataExports.service.js'
import type { ZodReply, ZodRequest } from '@/types/fastify.js'

type ListRequests = typeof listDataRequestsRoute
type CreateRequest = typeof createDataRequestRoute
type GetRequest = typeof getDataRequestRoute
type CancelRequest = typeof cancelDataRequestRoute
type RetryRequest = typeof retryDataRequestRoute
type DownloadRequest = typeof downloadDataRequestRoute
type ListExports = typeof listExportsRoute
type CreateExport = typeof createExportRoute
type GetExport = typeof getExportRoute
type RetryExport = typeof retryExportRoute
type DownloadExport = typeof downloadExportRoute
type GetRetention = typeof getRetentionRoute

export class DataControlController {
  constructor(
    private readonly dataControl: DataControlService,
    private readonly dataExports: DataExportsService,
  ) {}

  listRequests = async (request: ZodRequest<ListRequests>, reply: ZodReply<ListRequests>) => {
    const { items, nextCursor } = await this.dataControl.list(request.tenant, request.query)
    reply.page(items, nextCursor)
  }

  createRequest = async (request: ZodRequest<CreateRequest>, reply: ZodReply<CreateRequest>) => {
    reply.created(await this.dataControl.create(request.tenant, request.body))
  }

  getRequest = async (request: ZodRequest<GetRequest>, reply: ZodReply<GetRequest>) => {
    reply.ok(await this.dataControl.get(request.tenant, request.params.dataRequestId))
  }

  cancelRequest = async (request: ZodRequest<CancelRequest>, reply: ZodReply<CancelRequest>) => {
    reply.ok(await this.dataControl.cancel(request.tenant, request.params.dataRequestId))
  }

  retryRequest = async (request: ZodRequest<RetryRequest>, reply: ZodReply<RetryRequest>) => {
    reply.ok(await this.dataControl.retry(request.tenant, request.params.dataRequestId))
  }

  downloadRequest = async (
    request: ZodRequest<DownloadRequest>,
    reply: ZodReply<DownloadRequest>,
  ) => {
    reply.ok(await this.dataControl.download(request.tenant, request.params.dataRequestId))
  }

  listExports = async (request: ZodRequest<ListExports>, reply: ZodReply<ListExports>) => {
    const { items, nextCursor } = await this.dataExports.list(request.tenant, request.query)
    reply.page(items, nextCursor)
  }

  createExport = async (request: ZodRequest<CreateExport>, reply: ZodReply<CreateExport>) => {
    const created = await this.dataExports.create(request.tenant, request.body)
    await reply.status(202).send({ data: created })
  }

  getExport = async (request: ZodRequest<GetExport>, reply: ZodReply<GetExport>) => {
    reply.ok(await this.dataExports.get(request.tenant, request.params.exportId))
  }

  retryExport = async (request: ZodRequest<RetryExport>, reply: ZodReply<RetryExport>) => {
    const queued = await this.dataExports.retry(request.tenant, request.params.exportId)
    await reply.status(202).send({ data: queued })
  }

  downloadExport = async (request: ZodRequest<DownloadExport>, reply: ZodReply<DownloadExport>) => {
    reply.ok(await this.dataExports.download(request.tenant, request.params.exportId))
  }

  retention = async (request: ZodRequest<GetRetention>, reply: ZodReply<GetRetention>) => {
    reply.ok(await this.dataControl.retention(request.tenant))
  }
}
