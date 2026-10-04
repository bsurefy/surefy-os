// SPDX-License-Identifier: AGPL-3.0-only
import {
  auditEntryDtoSchema,
  auditEntryParamsSchema,
  auditIntegrityStatusDtoSchema,
  listAuditEntriesQuerySchema,
  okResponse,
  orgParamsSchema,
  pageResponse,
} from '@surefy/contracts'

const TAGS = ['audit']

export const listAuditEntriesRoute = {
  tags: TAGS,
  summary: 'List audit entries, newest first',
  params: orgParamsSchema,
  querystring: listAuditEntriesQuerySchema,
  response: { 200: pageResponse(auditEntryDtoSchema) },
}

export const getAuditEntryRoute = {
  tags: TAGS,
  summary: 'Get one audit entry with its chain position',
  params: auditEntryParamsSchema,
  response: { 200: okResponse(auditEntryDtoSchema) },
}

export const getAuditIntegrityRoute = {
  tags: TAGS,
  summary: 'The chain head and the last verification',
  params: orgParamsSchema,
  response: { 200: okResponse(auditIntegrityStatusDtoSchema) },
}

export const verifyAuditRoute = {
  tags: TAGS,
  summary: 'Start a verification of the organization chain',
  params: orgParamsSchema,
  response: { 202: okResponse(auditIntegrityStatusDtoSchema) },
}
