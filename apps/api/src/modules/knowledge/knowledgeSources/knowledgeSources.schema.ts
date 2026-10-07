// SPDX-License-Identifier: AGPL-3.0-only
import {
  bulkKnowledgeSourcesInputSchema,
  bulkKnowledgeSourcesResultDtoSchema,
  createKnowledgeLinkInputSchema,
  downloadLinkDtoSchema,
  knowledgeBaseParamsSchema,
  knowledgeDocumentDetailDtoSchema,
  knowledgeDocumentDtoSchema,
  knowledgeDocumentPageDtoSchema,
  knowledgeDocumentParamsSchema,
  knowledgeFileUploadDtoSchema,
  knowledgeSourceDtoSchema,
  knowledgeSourceParamsSchema,
  listKnowledgeDocumentPagesQuerySchema,
  listKnowledgeDocumentsQuerySchema,
  listKnowledgeSourcesQuerySchema,
  okResponse,
  pageResponse,
  requestKnowledgeFileUploadInputSchema,
  retryKnowledgeSourceInputSchema,
  updateKnowledgeSourceInputSchema,
} from '@surefy/contracts'

const TAGS = ['knowledge']

export const listKnowledgeSourcesRoute = {
  tags: TAGS,
  summary: 'List the sources of a knowledge base',
  params: knowledgeBaseParamsSchema,
  querystring: listKnowledgeSourcesQuerySchema,
  response: { 200: pageResponse(knowledgeSourceDtoSchema) },
}

export const requestKnowledgeFileUploadRoute = {
  tags: TAGS,
  summary: 'Add a file: creates the source and a signed upload',
  params: knowledgeBaseParamsSchema,
  body: requestKnowledgeFileUploadInputSchema,
  response: { 201: okResponse(knowledgeFileUploadDtoSchema) },
}

export const createKnowledgeLinkRoute = {
  tags: TAGS,
  summary: 'Add a link: one page or a crawl of the same site',
  params: knowledgeBaseParamsSchema,
  body: createKnowledgeLinkInputSchema,
  response: { 201: okResponse(knowledgeSourceDtoSchema) },
}

export const bulkKnowledgeSourcesRoute = {
  tags: TAGS,
  summary: 'Re-index or remove several sources',
  params: knowledgeBaseParamsSchema,
  body: bulkKnowledgeSourcesInputSchema,
  response: { 200: okResponse(bulkKnowledgeSourcesResultDtoSchema) },
}

export const getKnowledgeSourceRoute = {
  tags: TAGS,
  summary: 'Get a source',
  params: knowledgeSourceParamsSchema,
  response: { 200: okResponse(knowledgeSourceDtoSchema) },
}

export const updateKnowledgeSourceRoute = {
  tags: TAGS,
  summary: 'Rename a source or change its crawl settings or OCR mode',
  params: knowledgeSourceParamsSchema,
  body: updateKnowledgeSourceInputSchema,
  response: { 200: okResponse(knowledgeSourceDtoSchema) },
}

export const deleteKnowledgeSourceRoute = {
  tags: TAGS,
  summary: 'Move a source to Recently deleted',
  params: knowledgeSourceParamsSchema,
}

export const completeKnowledgeSourceRoute = {
  tags: TAGS,
  summary: 'The file is uploaded: verify its bytes and queue it',
  params: knowledgeSourceParamsSchema,
  response: { 200: okResponse(knowledgeSourceDtoSchema) },
}

export const retryKnowledgeSourceRoute = {
  tags: TAGS,
  summary: 'Retry a failed, partly failed or paused source',
  params: knowledgeSourceParamsSchema,
  body: retryKnowledgeSourceInputSchema,
  response: { 200: okResponse(knowledgeSourceDtoSchema) },
}

export const syncKnowledgeSourceRoute = {
  tags: TAGS,
  summary: 'Sync a link now',
  params: knowledgeSourceParamsSchema,
  response: { 200: okResponse(knowledgeSourceDtoSchema) },
}

export const restoreKnowledgeSourceRoute = {
  tags: TAGS,
  summary: 'Restore a deleted source',
  params: knowledgeSourceParamsSchema,
  response: { 200: okResponse(knowledgeSourceDtoSchema) },
}

export const listKnowledgeDocumentsRoute = {
  tags: TAGS,
  summary: 'List the documents of a source',
  params: knowledgeSourceParamsSchema,
  querystring: listKnowledgeDocumentsQuerySchema,
  response: { 200: pageResponse(knowledgeDocumentDtoSchema) },
}

export const getKnowledgeDocumentRoute = {
  tags: TAGS,
  summary: 'Get a document for the preview',
  params: knowledgeDocumentParamsSchema,
  response: { 200: okResponse(knowledgeDocumentDetailDtoSchema) },
}

export const listKnowledgeDocumentPagesRoute = {
  tags: TAGS,
  summary: 'The extracted text of a document by page',
  params: knowledgeDocumentParamsSchema,
  querystring: listKnowledgeDocumentPagesQuerySchema,
  response: { 200: pageResponse(knowledgeDocumentPageDtoSchema) },
}

export const downloadKnowledgeDocumentRoute = {
  tags: TAGS,
  summary: 'A signed link to the original file',
  params: knowledgeDocumentParamsSchema,
  response: { 200: okResponse(downloadLinkDtoSchema) },
}
