// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import {
  KNOWLEDGE_CRAWL_DEPTH_MAX,
  KNOWLEDGE_LINK_REFRESH,
  knowledgeBaseDescriptionSchema,
  knowledgeBaseNameSchema,
} from '@surefy/contracts'

/** New knowledge base: a name, what it holds, "Local models only", and the teams that may search it. */
export const knowledgeBaseFormSchema = z.object({
  name: knowledgeBaseNameSchema,
  description: knowledgeBaseDescriptionSchema,
  isLocalOnly: z.boolean(),
  teamIds: z.array(z.uuid()),
})
export type KnowledgeBaseFormValues = z.input<typeof knowledgeBaseFormSchema>

/** Rename and describe an existing base (Settings tab and the header menu). */
export const renameBaseFormSchema = z.object({
  name: knowledgeBaseNameSchema,
  description: knowledgeBaseDescriptionSchema,
})
export type RenameBaseFormValues = z.input<typeof renameBaseFormSchema>

/** Restoring a base whose name was taken meanwhile asks for another name. */
export const restoreNameFormSchema = z.object({ name: knowledgeBaseNameSchema })
export type RestoreNameFormValues = z.input<typeof restoreNameFormSchema>

/** Add link: the address, how deep to crawl, which paths to keep or skip, and how often to refresh. */
export const linkFormSchema = z.object({
  url: z.url(),
  name: z.string().trim().max(200),
  crawlDepth: z.number().int().min(0).max(KNOWLEDGE_CRAWL_DEPTH_MAX),
  includePaths: z.string().trim().max(2000),
  excludePaths: z.string().trim().max(2000),
  refresh: z.enum(KNOWLEDGE_LINK_REFRESH),
})
export type LinkFormValues = z.input<typeof linkFormSchema>
