// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  CHAT_AUDIT_ACTIONS,
  CHAT_ERROR_CODES,
  CHAT_SHARES_MAX,
  CHAT_WEB_SEARCH_TOOL_NAME,
  chatMessagePartsSchema,
  chatSharedParamsSchema,
  chatSharesDtoSchema,
  createChatSharesInputSchema,
  createPromptInputSchema,
  ERROR_CODES,
  fillPromptVariables,
  listPromptsQuerySchema,
  notificationParamsSchema,
  parsePromptVariables,
  PERMISSIONS,
  PROMPT_VARIABLES_MAX,
  promptDtoSchema,
  ROLE_PERMISSIONS,
  sendChatMessageInputSchema,
  sharedChatDetailDtoSchema,
  updatePromptInputSchema,
} from '../index.js'

const id = '0190a5c4-0000-7000-8000-000000000001'
const id2 = '0190a5c4-0000-7000-8000-000000000002'
const user = { id, name: 'Maya', email: 'maya@example.com', imageUrl: null }

describe('chat shares', () => {
  it('shares with people and teams of the organization', () => {
    expect(
      createChatSharesInputSchema.safeParse({
        subjects: [
          { subjectType: 'user', userId: id },
          { subjectType: 'team', teamId: id2 },
        ],
      }).success,
    ).toBe(true)
    expect(createChatSharesInputSchema.safeParse({ subjects: [] }).success).toBe(false)
    expect(
      createChatSharesInputSchema.safeParse({ subjects: [{ subjectType: 'team', userId: id }] })
        .success,
    ).toBe(false)
    const many = Array.from({ length: CHAT_SHARES_MAX + 1 }, () => ({
      subjectType: 'user',
      userId: id,
    }))
    expect(createChatSharesInputSchema.safeParse({ subjects: many }).success).toBe(false)
  })

  it('lists the shares with the people they reach', () => {
    expect(
      chatSharesDtoSchema.safeParse({
        shares: [
          {
            id,
            subjectType: 'team',
            user: null,
            team: { id: id2, name: 'Support', memberCount: 8 },
            sharedBy: user,
            createdAt: '2026-10-01T10:00:00.000Z',
          },
        ],
        peopleWithAccess: 8,
        sharingEnabled: true,
      }).success,
    ).toBe(true)
  })

  it('shows a shared chat without the owner settings', () => {
    const detail = sharedChatDetailDtoSchema.parse({
      id,
      title: 'Q3 numbers',
      agentId: null,
      lastMessageAt: null,
      messageCount: 4,
      owner: user,
      sharedBy: user,
      sharedAt: '2026-10-01T10:00:00.000Z',
      folderId: id2,
    })
    expect(detail).not.toHaveProperty('folderId')
  })

  it('sends the share notification as plain params', () => {
    const params = { version: 1, chatTitle: 'Q3 numbers', teamName: 'Support' }
    expect(chatSharedParamsSchema.safeParse(params).success).toBe(true)
    expect(notificationParamsSchema.safeParse(params).success).toBe(true)
  })
})

describe('prompts', () => {
  it('parses variables once each, in order of first use', () => {
    expect(parsePromptVariables('Hi {customer}, about {order_id} for {customer}.')).toEqual([
      'customer',
      'order_id',
    ])
    expect(parsePromptVariables('JSON { "a": 1 } and {1st} and { spaced }')).toEqual([])
  })

  it('fills the variables it has values for', () => {
    expect(fillPromptVariables('Hi {customer}, {tone} please.', { customer: 'Acme' })).toBe(
      'Hi Acme, {tone} please.',
    )
    expect(fillPromptVariables('{toString}', {})).toBe('{toString}')
  })

  it('creates personal prompts by default and limits only shared ones to teams', () => {
    expect(createPromptInputSchema.parse({ title: 'Reply', body: 'Hi {name}' })).toEqual({
      title: 'Reply',
      body: 'Hi {name}',
      visibility: 'personal',
      teamIds: [],
    })
    expect(
      createPromptInputSchema.safeParse({ title: 'Reply', body: 'Hi', teamIds: [id] }).success,
    ).toBe(false)
    expect(
      createPromptInputSchema.safeParse({
        title: 'Reply',
        body: 'Hi',
        visibility: 'shared',
        teamIds: [id],
      }).success,
    ).toBe(true)
  })

  it('caps the variables of one prompt', () => {
    const body = Array.from({ length: PROMPT_VARIABLES_MAX + 1 }, (_, i) => `{v${i}}`).join(' ')
    expect(createPromptInputSchema.safeParse({ title: 'Many', body }).success).toBe(false)
  })

  it('rejects empty updates and teams on personal prompts', () => {
    expect(updatePromptInputSchema.safeParse({}).success).toBe(false)
    expect(
      updatePromptInputSchema.safeParse({ visibility: 'personal', teamIds: [id] }).success,
    ).toBe(false)
    expect(updatePromptInputSchema.safeParse({ title: 'New' }).success).toBe(true)
  })

  it('lists active prompts unless asked for the deleted ones', () => {
    expect(listPromptsQuerySchema.parse({}).state).toBe('active')
    expect(listPromptsQuerySchema.parse({ visibility: 'shared' }).visibility).toEqual(['shared'])
  })

  it('describes a shared prompt without an owner', () => {
    expect(
      promptDtoSchema.safeParse({
        id,
        title: 'Refund reply',
        body: 'Hi {customer}',
        variables: ['customer'],
        visibility: 'shared',
        teams: [],
        owner: null,
        canEdit: true,
        updatedBy: null,
        deletedAt: null,
        purgeAt: null,
        createdAt: '2026-10-01T10:00:00.000Z',
        updatedAt: '2026-10-01T10:00:00.000Z',
      }).success,
    ).toBe(true)
  })
})

describe('compare and web search', () => {
  it('asks for answer B to a user message', () => {
    expect(
      sendChatMessageInputSchema.safeParse({
        trigger: 'compare',
        messageId: id,
        modelKey: 'anthropic/claude-sonnet',
      }).success,
    ).toBe(true)
    expect(
      sendChatMessageInputSchema.safeParse({ trigger: 'compare', messageId: id }).success,
    ).toBe(false)
  })

  it('turns web search on per answer, off when absent', () => {
    const on = sendChatMessageInputSchema.parse({
      trigger: 'submit',
      text: 'News?',
      webSearch: true,
    })
    expect(on.trigger === 'submit' && on.webSearch).toBe(true)
    const off = sendChatMessageInputSchema.parse({ trigger: 'submit', text: 'News?' })
    expect(off.trigger === 'submit' && off.webSearch).toBeFalsy()
  })

  it('stores web results as cited sources and notes a skipped search', () => {
    expect(
      chatMessagePartsSchema.safeParse({
        version: 1,
        parts: [
          {
            type: 'tool',
            toolCallId: 'call_1',
            toolName: CHAT_WEB_SEARCH_TOOL_NAME,
            state: 'done',
            input: { q: 'surefy release' },
          },
          {
            type: 'source',
            index: 1,
            kind: 'web',
            url: 'https://example.com/news',
            title: 'News',
            snippet: 'Released today',
          },
          { type: 'data', name: 'web-search-skipped', data: { reason: 'provider_error' } },
        ],
      }).success,
    ).toBe(true)
  })
})

describe('chat V1 codes, permissions and audit', () => {
  it('registers every error code', () => {
    for (const code of Object.values(CHAT_ERROR_CODES)) expect(ERROR_CODES[code]).toBe(code)
  })

  it('lets Builders manage shared prompts, not plain users', () => {
    expect(ROLE_PERMISSIONS.builder).toContain(PERMISSIONS.PROMPTS_MANAGE_SHARED)
    expect(ROLE_PERMISSIONS.user).not.toContain(PERMISSIONS.PROMPTS_MANAGE_SHARED)
  })

  it('names audit actions <area>.<verb>', () => {
    for (const action of Object.values(CHAT_AUDIT_ACTIONS))
      expect(action).toMatch(/^(chat|prompt)\.[a-z_]+$/)
  })
})
