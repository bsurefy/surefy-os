// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { userRefDtoSchema } from '../auth/schemas.js'
import { multiValueQuery, searchQuery } from '../core/filters.js'
import { pageQuery, sortQuery } from '../core/pagination.js'
import { orgParamsSchema } from '../core/params.js'
import { teamRefDtoSchema } from '../teams/schemas.js'

// The prompt library (database/chat.md §9–10; Chat › Prompt library). Routes, all under
// /api/v1/orgs/:orgId/prompts (`chat:use`; shared prompts also need `prompts:manage-shared`):
// GET / · POST / · GET/PATCH/DELETE /:promptId · POST /:promptId/restore.
// Personal prompts are their owner's only. A shared prompt is seen by the whole organization, or
// only by the teams it lists (and its owner), and is managed by anyone with
// `prompts:manage-shared` who can see it. Recently deleted lists the person's deleted chats and
// prompts together: the screen merges `GET /chats?state=deleted` and `GET /prompts?state=deleted`.

export const PROMPT_VISIBILITIES = ['personal', 'shared'] as const
export type PromptVisibility = (typeof PROMPT_VISIBILITIES)[number]

export const PROMPT_LIST_STATES = ['active', 'deleted'] as const
export type PromptListState = (typeof PROMPT_LIST_STATES)[number]

export const PROMPT_RESTORE_WINDOW_DAYS = 30
export const PROMPT_TITLE_MAX_LENGTH = 200
export const PROMPT_BODY_MAX_LENGTH = 20_000
export const PROMPT_VARIABLES_MAX = 20
export const PROMPT_VARIABLE_VALUE_MAX_LENGTH = 10_000
/** Most teams a shared prompt is limited to. */
export const PROMPT_TEAMS_MAX = 50

/**
 * A placeholder is `{name}`: a letter, then up to 39 letters, digits or underscores. Anything else
 * in braces (`{ }`, `{1st}`, JSON) is plain text.
 */
export const PROMPT_VARIABLE_PATTERN = /\{([A-Za-z]\w{0,39})\}/g

/** The variable names of a body, in order of first use, each once. The server stores them on save. */
export function parsePromptVariables(body: string): string[] {
  const names: string[] = []
  for (const match of body.matchAll(PROMPT_VARIABLE_PATTERN)) {
    const name = match[1]
    if (name !== undefined && !names.includes(name)) names.push(name)
  }
  return names
}

/** Replaces each `{name}` with its value; a variable without a value keeps its placeholder. */
export function fillPromptVariables(
  body: string,
  values: Readonly<Record<string, string>>,
): string {
  return body.replaceAll(PROMPT_VARIABLE_PATTERN, (placeholder, name: string) =>
    Object.hasOwn(values, name) ? (values[name] ?? placeholder) : placeholder,
  )
}

export const promptParamsSchema = orgParamsSchema.extend({ promptId: z.uuid() })
export type PromptParams = z.infer<typeof promptParamsSchema>

export const promptTitleSchema = z.string().trim().min(1).max(PROMPT_TITLE_MAX_LENGTH)

export const promptBodySchema = z
  .string()
  .trim()
  .min(1)
  .max(PROMPT_BODY_MAX_LENGTH)
  .refine((body) => parsePromptVariables(body).length <= PROMPT_VARIABLES_MAX, {
    message: `A prompt has at most ${PROMPT_VARIABLES_MAX} variables`,
  })

const teamIdsSchema = z.array(z.uuid()).max(PROMPT_TEAMS_MAX)

/**
 * `POST /prompts`. `teamIds` limits a shared prompt to those teams (empty: the whole
 * organization); a personal prompt takes none.
 */
export const createPromptInputSchema = z
  .object({
    title: promptTitleSchema,
    body: promptBodySchema,
    visibility: z.enum(PROMPT_VISIBILITIES).default('personal'),
    teamIds: teamIdsSchema.default([]),
  })
  .refine((input) => input.visibility === 'shared' || input.teamIds.length === 0, {
    message: 'Only a shared prompt is limited to teams',
    path: ['teamIds'],
  })
export type CreatePromptInput = z.infer<typeof createPromptInputSchema>

/**
 * `PATCH /prompts/:promptId`. `teamIds` replaces the list. Switching to `personal` removes the
 * teams and makes the person who switches it its owner; switching to `shared` needs
 * `prompts:manage-shared`.
 */
export const updatePromptInputSchema = z
  .object({
    title: promptTitleSchema,
    body: promptBodySchema,
    visibility: z.enum(PROMPT_VISIBILITIES),
    teamIds: teamIdsSchema,
  })
  .partial()
  .refine((input) => Object.keys(input).length > 0, { message: 'Change at least one field' })
  .refine((input) => input.visibility !== 'personal' || (input.teamIds ?? []).length === 0, {
    message: 'Only a shared prompt is limited to teams',
    path: ['teamIds'],
  })
export type UpdatePromptInput = z.infer<typeof updatePromptInputSchema>

export const PROMPT_SORT_FIELDS = ['updatedAt', 'title', 'deletedAt'] as const

/** `GET /prompts`: the person's own prompts and the shared prompts they can see. */
export const listPromptsQuerySchema = pageQuery.extend({
  /** Matches the title and the body. */
  q: searchQuery,
  visibility: multiValueQuery(z.enum(PROMPT_VISIBILITIES)),
  state: z.enum(PROMPT_LIST_STATES).default('active'),
  sort: sortQuery(PROMPT_SORT_FIELDS),
})
export type ListPromptsQuery = z.infer<typeof listPromptsQuerySchema>

export const promptDtoSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  body: z.string(),
  /** Parsed from the body on save, in order of first use. */
  variables: z.array(z.string()),
  visibility: z.enum(PROMPT_VISIBILITIES),
  /** Shared prompts limited to teams; empty means the whole organization. */
  teams: z.array(teamRefDtoSchema),
  /** Null for a shared prompt whose owner was erased. */
  owner: userRefDtoSchema.nullable(),
  /** The person may edit, delete and restore it. */
  canEdit: z.boolean(),
  updatedBy: userRefDtoSchema.nullable(),
  deletedAt: z.iso.datetime().nullable(),
  /** `deletedAt` + the restore window; Recently deleted shows "{n} days left". */
  purgeAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type PromptDto = z.infer<typeof promptDtoSchema>
