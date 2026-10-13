// SPDX-License-Identifier: AGPL-3.0-only
import { createEmptyAgentDefinition } from '@surefy/contracts'
import type { AgentTemplateDto } from '@surefy/contracts'

const GPT = {
  modelKey: 'openai/gpt-4.1',
  displayName: 'GPT-4.1',
  providerKey: 'openai',
  source: 'provider',
} as const
const CLAUDE = {
  modelKey: 'anthropic/claude-sonnet-4',
  displayName: 'Claude Sonnet 4',
  providerKey: 'anthropic',
  source: 'provider',
} as const

function templateDefinition(
  instructions: string,
  conversationStarters: string[],
): AgentTemplateDto['definition'] {
  const { version, tone, tools, knowledge, guard } = createEmptyAgentDefinition(GPT.modelKey)
  return { version, tone, tools, knowledge, guard, instructions, conversationStarters }
}

/** The four code-only templates as the API lists them (agents.md › Templates). */
export const AGENT_TEMPLATES: AgentTemplateDto[] = [
  {
    key: 'customer_support',
    name: 'Customer Support',
    description: 'Answers order and refund questions and hands over to a person when it is unsure.',
    tools: [
      {
        name: 'Order lookup',
        kind: 'bridge_action',
        permission: 'read_only',
        setup: 'bridge_not_installed',
        bridgeKey: 'shopify',
      },
      {
        name: 'Refund API',
        kind: 'api',
        permission: 'can_act',
        setup: 'needs_connection',
        bridgeKey: null,
      },
    ],
    knowledgeSuggestion: 'Your support articles',
    guardRules: ['Refunds over $200 need approval'],
    suggestedModel: GPT,
    definition: templateDefinition('You answer customer questions about orders and refunds.', [
      'Where is my order?',
      'How do I get a refund?',
    ]),
  },
  {
    key: 'hr_helper',
    name: 'HR Helper',
    description: 'Answers questions about leave, benefits and policies from your HR documents.',
    tools: [
      {
        name: 'Web search',
        kind: 'web_search',
        permission: 'read_only',
        setup: 'ready',
        bridgeKey: null,
      },
    ],
    knowledgeSuggestion: 'Your HR policies',
    guardRules: ['Questions about pay and contracts go to a person'],
    suggestedModel: CLAUDE,
    definition: templateDefinition('You answer employee questions about HR policies.', [
      'How many vacation days do I have?',
    ]),
  },
  {
    key: 'sales_assistant',
    name: 'Sales Assistant',
    description: 'Prepares account summaries and drafts follow-ups for your sales team.',
    tools: [
      {
        name: 'Find accounts',
        kind: 'bridge_action',
        permission: 'read_only',
        setup: 'ready',
        bridgeKey: 'hubspot',
      },
      {
        name: 'Send email',
        kind: 'bridge_action',
        permission: 'ask_first',
        setup: 'bridge_not_installed',
        bridgeKey: 'gmail',
      },
    ],
    knowledgeSuggestion: 'Your product sheets',
    guardRules: ['Emails to customers need approval'],
    suggestedModel: GPT,
    definition: templateDefinition('You help the sales team prepare for customer conversations.', [
      'Summarize this account',
    ]),
  },
  {
    key: 'invoice_checker',
    name: 'Invoice Checker',
    description: 'Compares invoices with orders and flags what does not match.',
    tools: [
      {
        name: 'Order API',
        kind: 'api',
        permission: 'read_only',
        setup: 'needs_connection',
        bridgeKey: null,
      },
    ],
    knowledgeSuggestion: null,
    guardRules: [],
    suggestedModel: null,
    definition: templateDefinition('You check invoices against orders and report differences.', []),
  },
]
