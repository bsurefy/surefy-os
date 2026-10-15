// SPDX-License-Identifier: AGPL-3.0-only
import {
  createKnowledgeConnectorSourceInputSchema,
  knowledgeBaseParamsSchema,
  knowledgeConnectorItemsDtoSchema,
  knowledgeSourceDtoSchema,
  listKnowledgeConnectorItemsQuerySchema,
  okResponse,
} from '@surefy/contracts'

const TAGS = ['knowledge']

export const listKnowledgeConnectorItemsRoute = {
  tags: TAGS,
  summary: 'List the folders or pages a connection can see, one level at a time',
  params: knowledgeBaseParamsSchema,
  querystring: listKnowledgeConnectorItemsQuerySchema,
  response: { 200: okResponse(knowledgeConnectorItemsDtoSchema) },
}

export const createKnowledgeConnectorSourceRoute = {
  tags: TAGS,
  summary: 'Add Google Drive folders or Notion pages; the first sync starts at once',
  params: knowledgeBaseParamsSchema,
  body: createKnowledgeConnectorSourceInputSchema,
  response: { 201: okResponse(knowledgeSourceDtoSchema) },
}
