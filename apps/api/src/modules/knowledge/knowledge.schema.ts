// SPDX-License-Identifier: AGPL-3.0-only
import {
  createKnowledgeBaseInputSchema,
  deletedKnowledgeItemDtoSchema,
  knowledgeAccessDtoSchema,
  knowledgeAccessImpactDtoSchema,
  knowledgeAccessImpactQuerySchema,
  knowledgeBaseDtoSchema,
  knowledgeBaseImpactDtoSchema,
  knowledgeBaseParamsSchema,
  knowledgeReindexImpactDtoSchema,
  knowledgeReindexImpactQuerySchema,
  knowledgeSummaryDtoSchema,
  knowledgeTestSearchDtoSchema,
  knowledgeTestSearchInputSchema,
  listDeletedKnowledgeQuerySchema,
  listKnowledgeBasesQuerySchema,
  okResponse,
  orgParamsSchema,
  pageResponse,
  restoreKnowledgeBaseInputSchema,
  setKnowledgeAccessInputSchema,
  setKnowledgeEmbeddingModelInputSchema,
  updateKnowledgeBaseInputSchema,
} from '@surefy/contracts'

const TAGS = ['knowledge']

export const knowledgeSummaryRoute = {
  tags: TAGS,
  summary: 'The KPIs above the knowledge bases list',
  params: orgParamsSchema,
  response: { 200: okResponse(knowledgeSummaryDtoSchema) },
}

export const listDeletedKnowledgeRoute = {
  tags: TAGS,
  summary: 'Knowledge bases and sources deleted in the last 30 days',
  params: orgParamsSchema,
  querystring: listDeletedKnowledgeQuerySchema,
  response: { 200: pageResponse(deletedKnowledgeItemDtoSchema) },
}

export const listKnowledgeBasesRoute = {
  tags: TAGS,
  summary: 'List the knowledge bases the caller can search',
  params: orgParamsSchema,
  querystring: listKnowledgeBasesQuerySchema,
  response: { 200: pageResponse(knowledgeBaseDtoSchema) },
}

export const createKnowledgeBaseRoute = {
  tags: TAGS,
  summary: 'Create a knowledge base',
  params: orgParamsSchema,
  body: createKnowledgeBaseInputSchema,
  response: { 201: okResponse(knowledgeBaseDtoSchema) },
}

export const getKnowledgeBaseRoute = {
  tags: TAGS,
  summary: 'Get a knowledge base',
  params: knowledgeBaseParamsSchema,
  response: { 200: okResponse(knowledgeBaseDtoSchema) },
}

export const updateKnowledgeBaseRoute = {
  tags: TAGS,
  summary: 'Rename a knowledge base or change its settings',
  params: knowledgeBaseParamsSchema,
  body: updateKnowledgeBaseInputSchema,
  response: { 200: okResponse(knowledgeBaseDtoSchema) },
}

export const deleteKnowledgeBaseRoute = {
  tags: TAGS,
  summary: 'Move a knowledge base to Recently deleted',
  params: knowledgeBaseParamsSchema,
}

export const knowledgeBaseImpactRoute = {
  tags: TAGS,
  summary: 'What deleting the knowledge base takes away',
  params: knowledgeBaseParamsSchema,
  response: { 200: okResponse(knowledgeBaseImpactDtoSchema) },
}

export const restoreKnowledgeBaseRoute = {
  tags: TAGS,
  summary: 'Restore a deleted knowledge base',
  params: knowledgeBaseParamsSchema,
  body: restoreKnowledgeBaseInputSchema,
  response: { 200: okResponse(knowledgeBaseDtoSchema) },
}

export const reindexKnowledgeBaseRoute = {
  tags: TAGS,
  summary: 'Re-index every document of the knowledge base',
  params: knowledgeBaseParamsSchema,
  response: { 200: okResponse(knowledgeBaseDtoSchema) },
}

export const knowledgeReindexImpactRoute = {
  tags: TAGS,
  summary: 'What a re-index or an embedding model change takes',
  params: knowledgeBaseParamsSchema,
  querystring: knowledgeReindexImpactQuerySchema,
  response: { 200: okResponse(knowledgeReindexImpactDtoSchema) },
}

export const setKnowledgeEmbeddingModelRoute = {
  tags: TAGS,
  summary: 'Start re-embedding the knowledge base with another model',
  params: knowledgeBaseParamsSchema,
  body: setKnowledgeEmbeddingModelInputSchema,
  response: { 202: okResponse(knowledgeBaseDtoSchema) },
}

export const cancelKnowledgeEmbeddingModelRoute = {
  tags: TAGS,
  summary: 'Cancel a running embedding model change',
  params: knowledgeBaseParamsSchema,
}

export const getKnowledgeAccessRoute = {
  tags: TAGS,
  summary: 'Who can search or manage the knowledge base',
  params: knowledgeBaseParamsSchema,
  response: { 200: okResponse(knowledgeAccessDtoSchema) },
}

export const setKnowledgeAccessRoute = {
  tags: TAGS,
  summary: 'Replace the access grants of the knowledge base',
  params: knowledgeBaseParamsSchema,
  body: setKnowledgeAccessInputSchema,
  response: { 200: okResponse(knowledgeAccessDtoSchema) },
}

export const knowledgeAccessImpactRoute = {
  tags: TAGS,
  summary: 'What removing a team’s access takes away',
  params: knowledgeBaseParamsSchema,
  querystring: knowledgeAccessImpactQuerySchema,
  response: { 200: okResponse(knowledgeAccessImpactDtoSchema) },
}

export const knowledgeTestSearchRoute = {
  tags: TAGS,
  summary: 'Search the knowledge base as chat would, and preview the answer',
  params: knowledgeBaseParamsSchema,
  body: knowledgeTestSearchInputSchema,
  response: { 200: okResponse(knowledgeTestSearchDtoSchema) },
}
