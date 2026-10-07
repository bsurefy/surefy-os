// SPDX-License-Identifier: AGPL-3.0-only
import {
  createDataRequestInputSchema,
  createExportInputSchema,
  dataRequestDtoSchema,
  dataRequestParamsSchema,
  dataRetentionDtoSchema,
  downloadLinkDtoSchema,
  exportDtoSchema,
  exportIdParamsSchema,
  listDataRequestsQuerySchema,
  listExportsQuerySchema,
  okResponse,
  orgParamsSchema,
  pageResponse,
} from '@surefy/contracts'

const TAGS = ['data-control']

export const listDataRequestsRoute = {
  tags: TAGS,
  summary: 'List the organization data requests',
  params: orgParamsSchema,
  querystring: listDataRequestsQuerySchema,
  response: { 200: pageResponse(dataRequestDtoSchema) },
}

export const createDataRequestRoute = {
  tags: TAGS,
  summary: 'Export all data, or schedule the organization deletion',
  params: orgParamsSchema,
  body: createDataRequestInputSchema,
  response: { 201: okResponse(dataRequestDtoSchema) },
}

export const getDataRequestRoute = {
  tags: TAGS,
  summary: 'Get a data request',
  params: dataRequestParamsSchema,
  response: { 200: okResponse(dataRequestDtoSchema) },
}

export const cancelDataRequestRoute = {
  tags: TAGS,
  summary: 'Cancel a scheduled deletion or an export not started yet',
  params: dataRequestParamsSchema,
  response: { 200: okResponse(dataRequestDtoSchema) },
}

export const retryDataRequestRoute = {
  tags: TAGS,
  summary: 'Prepare a failed export again',
  params: dataRequestParamsSchema,
  response: { 200: okResponse(dataRequestDtoSchema) },
}

export const downloadDataRequestRoute = {
  tags: TAGS,
  summary: 'A short-lived link to the export archive',
  params: dataRequestParamsSchema,
  response: { 200: okResponse(downloadLinkDtoSchema) },
}

export const listExportsRoute = {
  tags: TAGS,
  summary: 'Your background exports',
  params: orgParamsSchema,
  querystring: listExportsQuerySchema,
  response: { 200: pageResponse(exportDtoSchema) },
}

export const createExportRoute = {
  tags: TAGS,
  summary: 'Prepare an export in the background',
  params: orgParamsSchema,
  body: createExportInputSchema,
  response: { 202: okResponse(exportDtoSchema) },
}

export const getExportRoute = {
  tags: TAGS,
  summary: 'Get one of your exports',
  params: exportIdParamsSchema,
  response: { 200: okResponse(exportDtoSchema) },
}

export const retryExportRoute = {
  tags: TAGS,
  summary: 'Prepare a failed or expired export again',
  params: exportIdParamsSchema,
  response: { 202: okResponse(exportDtoSchema) },
}

export const downloadExportRoute = {
  tags: TAGS,
  summary: 'A short-lived link to the export file',
  params: exportIdParamsSchema,
  response: { 200: okResponse(downloadLinkDtoSchema) },
}

export const getRetentionRoute = {
  tags: TAGS,
  summary: 'Where data is stored and how long each kind is kept',
  params: orgParamsSchema,
  response: { 200: okResponse(dataRetentionDtoSchema) },
}
