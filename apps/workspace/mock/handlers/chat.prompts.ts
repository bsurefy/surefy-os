// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import {
  createPromptInputSchema,
  ERROR_CODES,
  okResponse,
  PAGE_SIZE,
  pageResponse,
  parsePromptVariables,
  PROMPT_RESTORE_WINDOW_DAYS,
  promptDtoSchema,
  updatePromptInputSchema,
} from '@surefy/contracts'
import type { PromptDto, TeamRefDto } from '@surefy/contracts'
import { fixtureUuid } from '@surefy/web-core/testing'
import { defineMockHandler, mockError, mockOk, mockPage } from '@surefy/web-core/testing/mock'

import { MAYA, OMAR } from './shell.fixtures'
import { SALES_TEAM_ID, SUPPORT_TEAM_ID } from './teams'

const PROMPT_KIND = 97
const HTTP_NOT_FOUND = 404
const HTTP_UNPROCESSABLE = 422
const DAY_MS = 86_400_000

const SUPPORT_TEAM: TeamRefDto = { id: SUPPORT_TEAM_ID, name: 'Support' }
const TEAMS: Record<string, TeamRefDto> = {
  [SUPPORT_TEAM_ID]: SUPPORT_TEAM,
  [SALES_TEAM_ID]: { id: SALES_TEAM_ID, name: 'Sales' },
}

export const PROMPT_IDS = {
  summary: fixtureUuid(PROMPT_KIND, 1),
  reply: fixtureUuid(PROMPT_KIND, 2),
  plain: fixtureUuid(PROMPT_KIND, 3),
  deleted: fixtureUuid(PROMPT_KIND, 4),
} as const

const ago = (ms: number) => new Date(Date.now() - ms).toISOString()

function prompt(
  id: string,
  title: string,
  body: string,
  extra: Partial<PromptDto> = {},
): PromptDto {
  return {
    id,
    title,
    body,
    variables: parsePromptVariables(body),
    visibility: 'personal',
    teams: [],
    owner: MAYA,
    canEdit: true,
    updatedBy: MAYA,
    deletedAt: null,
    purgeAt: null,
    createdAt: ago(5 * DAY_MS),
    updatedAt: ago(DAY_MS),
    ...extra,
  }
}

function seed(): PromptDto[] {
  return [
    prompt(
      PROMPT_IDS.summary,
      'Summarize a document',
      'Summarize {document} in {count} bullet points for {audience}.',
      { updatedAt: ago(DAY_MS) },
    ),
    prompt(PROMPT_IDS.plain, 'Explain simply', 'Explain this as if I were new to the topic.', {
      updatedAt: ago(2 * DAY_MS),
    }),
    prompt(
      PROMPT_IDS.reply,
      'Reply to a customer',
      'Write a friendly reply to {customer} about {issue}.',
      {
        visibility: 'shared',
        teams: [SUPPORT_TEAM],
        owner: OMAR,
        updatedBy: OMAR,
        updatedAt: ago(3 * DAY_MS),
      },
    ),
    prompt(PROMPT_IDS.deleted, 'Old standup notes', 'List {team} standup notes.', {
      deletedAt: ago(6 * DAY_MS),
      purgeAt: ago(-(PROMPT_RESTORE_WINDOW_DAYS - 6) * DAY_MS),
      updatedAt: ago(4 * DAY_MS),
    }),
  ]
}

let prompts = seed()
let ordinal = 100

/** Back to the seeded prompts; tests call it between cases. */
export function resetChatPromptsMock(): void {
  prompts = seed()
  ordinal = 100
}

const notFound = () => mockError(HTTP_NOT_FOUND, ERROR_CODES.PROMPT_NOT_FOUND, 'Prompt not found')
const teamNotFound = () =>
  mockError(HTTP_UNPROCESSABLE, ERROR_CODES.PROMPT_TEAM_NOT_FOUND, 'Team not found')

const find = (id: unknown) => prompts.find((candidate) => candidate.id === id)
const replace = (next: PromptDto) => {
  prompts = prompts.map((candidate) => (candidate.id === next.id ? next : candidate))
  return next
}

function teamsOf(teamIds: readonly string[]): TeamRefDto[] | null {
  const teams = teamIds.map((id) => TEAMS[id])
  return teams.every((team) => team !== undefined) ? teams : null
}

const SORTS: Record<string, (a: PromptDto, b: PromptDto) => number> = {
  title: (a, b) => a.title.localeCompare(b.title),
  updatedAt: (a, b) => a.updatedAt.localeCompare(b.updatedAt),
  deletedAt: (a, b) => (a.deletedAt ?? '').localeCompare(b.deletedAt ?? ''),
}

function listPrompts(request: Request) {
  const url = new URL(request.url)
  const q = url.searchParams.get('q')?.toLowerCase()
  const isDeleted = url.searchParams.get('state') === 'deleted'
  const visibility = url.searchParams.getAll('visibility')
  const sort = url.searchParams.get('sort') ?? '-updatedAt'
  const field = sort.replace(/^-/, '')
  const compare = SORTS[field] ?? SORTS.updatedAt
  const direction = sort.startsWith('-') ? -1 : 1
  const limit = Number(url.searchParams.get('limit') ?? PAGE_SIZE.default)
  const start = Number(url.searchParams.get('cursor') ?? 0)
  const items = prompts
    .filter((item) => (item.deletedAt !== null) === isDeleted)
    .filter((item) => visibility.length === 0 || visibility.includes(item.visibility))
    .filter(
      (item) => !q || item.title.toLowerCase().includes(q) || item.body.toLowerCase().includes(q),
    )
    .toSorted((a, b) => (compare?.(a, b) ?? 0) * direction)
  const next = start + limit < items.length ? String(start + limit) : null
  return mockPage(items.slice(start, start + limit), next)
}

/**
 * The prompt library (C-11 prompts) until the integration task (I6-05) switches to the real API.
 * Scenarios: `no-prompts` is an empty library.
 */
export function createChatPromptHandlers() {
  const path = '/orgs/:orgId/prompts'
  return [
    defineMockHandler({
      method: 'get',
      path,
      response: pageResponse(promptDtoSchema),
      scenarios: {
        default: ({ request }) => listPrompts(request),
        'no-prompts': () => mockPage([], null),
      },
    }),
    defineMockHandler({
      method: 'post',
      path,
      response: okResponse(promptDtoSchema),
      scenarios: {
        default: async ({ request }) => {
          const input = createPromptInputSchema.parse(await request.json())
          const teams = teamsOf(input.teamIds)
          if (!teams) return teamNotFound()
          const now = new Date().toISOString()
          const created = prompt(fixtureUuid(PROMPT_KIND, ++ordinal), input.title, input.body, {
            visibility: input.visibility,
            teams,
            createdAt: now,
            updatedAt: now,
          })
          prompts = [created, ...prompts]
          return mockOk(created, { status: 201 })
        },
      },
    }),
    defineMockHandler({
      method: 'patch',
      path: `${path}/:promptId`,
      response: okResponse(promptDtoSchema),
      scenarios: {
        default: async ({ params, request }) => {
          const found = find(params.promptId)
          if (!found || found.deletedAt) return notFound()
          const input = updatePromptInputSchema.parse(await request.json())
          const teams = input.teamIds === undefined ? found.teams : teamsOf(input.teamIds)
          if (!teams) return teamNotFound()
          const visibility = input.visibility ?? found.visibility
          const body = input.body ?? found.body
          return mockOk(
            replace({
              ...found,
              title: input.title ?? found.title,
              body,
              variables: parsePromptVariables(body),
              visibility,
              teams: visibility === 'personal' ? [] : teams,
              owner: visibility === 'personal' ? MAYA : found.owner,
              updatedBy: MAYA,
              updatedAt: new Date().toISOString(),
            }),
          )
        },
      },
    }),
    defineMockHandler({
      method: 'delete',
      path: `${path}/:promptId`,
      response: okResponse(z.null()),
      scenarios: {
        default: ({ params }) => {
          const found = find(params.promptId)
          if (!found || found.deletedAt) return notFound()
          replace({
            ...found,
            deletedAt: new Date().toISOString(),
            purgeAt: ago(-PROMPT_RESTORE_WINDOW_DAYS * DAY_MS),
          })
          return new Response(null, { status: 204 })
        },
      },
    }),
    defineMockHandler({
      method: 'post',
      path: `${path}/:promptId/restore`,
      response: okResponse(promptDtoSchema),
      scenarios: {
        default: ({ params }) => {
          const found = find(params.promptId)
          if (!found?.deletedAt) return notFound()
          return mockOk(replace({ ...found, deletedAt: null, purgeAt: null }))
        },
        'restore-gone': () => notFound(),
      },
    }),
  ]
}
