// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { orgParamsSchema } from '../core/params.js'

export const knowledgeBaseParamsSchema = orgParamsSchema.extend({ baseId: z.uuid() })
export type KnowledgeBaseParams = z.infer<typeof knowledgeBaseParamsSchema>

export const knowledgeSourceParamsSchema = knowledgeBaseParamsSchema.extend({ sourceId: z.uuid() })
export type KnowledgeSourceParams = z.infer<typeof knowledgeSourceParamsSchema>

export const knowledgeDocumentParamsSchema = knowledgeBaseParamsSchema.extend({
  documentId: z.uuid(),
})
export type KnowledgeDocumentParams = z.infer<typeof knowledgeDocumentParamsSchema>
