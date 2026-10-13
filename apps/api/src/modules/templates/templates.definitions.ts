// SPDX-License-Identifier: AGPL-3.0-only
import type { AgentGuard, AgentTemplateKey, AgentToolPermission } from '@surefy/contracts'

// The agent templates (design/workspace/agents.md › Templates). They are code: the definitions
// ship with the release and need no tables. A template names the bridge actions it wants by the
// bridge's key; an organization that has not installed the bridge sees the tool as "Not
// installed", and the agent is created without it.

/** A tool of a template: a bridge action, or the web search. */
export type TemplateToolSpec =
  | {
      kind: 'bridge_action'
      /** Stable inside the template, so the tool keeps its id across releases. */
      slug: string
      name: string
      description: string
      permission: AgentToolPermission
      bridgeKey: string
      actionName: string
    }
  | {
      kind: 'web_search'
      slug: string
      name: string
      description: string
      permission: AgentToolPermission
    }

export interface TemplateSpec {
  key: AgentTemplateKey
  name: string
  description: string
  instructions: string
  tone: string
  conversationStarters: readonly string[]
  creativity: number
  tools: readonly TemplateToolSpec[]
  /** The knowledge the template suggests attaching; knowledge is never preselected. */
  knowledgeSuggestion: string | null
  /** Rules for the agent's Guard tab, written against the tool names above. */
  guard: Pick<AgentGuard, 'approvalRules' | 'blockedActions'>
  /** One line per rule, as the card shows them. */
  guardLines: readonly string[]
  /** Model keys the template recommends, best first; the first one the person may use is suggested. */
  preferredModelKeys: readonly string[]
}

const ADMINS = [{ type: 'role', id: 'admin' }] as const

const PREFERRED_MODELS = [
  'anthropic/claude-sonnet-5-5',
  'openai/gpt-4.1',
  'anthropic/claude-haiku-5-5',
  'openai/gpt-4.1-mini',
] as const

const customerSupport: TemplateSpec = {
  key: 'customer_support',
  name: 'Customer Support',
  description:
    'Answers customers from your support articles, looks up tickets and handles refunds.',
  instructions: [
    'You are a customer support agent. Answer from the knowledge you were given and say so when you do not know.',
    'Be kind and concrete: name the order or ticket you are talking about, and say what happens next.',
    'Look a ticket up before you answer questions about it. Never promise a refund: ask for it with the refund tool and tell the customer it needs a person to approve it.',
    'Hand over to a person when the customer asks for one or is upset.',
  ].join('\n\n'),
  tone: 'Warm, brief and plain',
  conversationStarters: [
    'Where is my order?',
    'I would like to return something',
    'Can you check on my ticket?',
  ],
  creativity: 0.3,
  tools: [
    {
      kind: 'bridge_action',
      slug: 'look-up-ticket',
      name: 'Look up ticket',
      description: 'Finds a support ticket by its number or the customer’s email.',
      permission: 'read_only',
      bridgeKey: 'zendesk',
      actionName: 'search_tickets',
    },
    {
      kind: 'bridge_action',
      slug: 'reply-to-ticket',
      name: 'Reply to ticket',
      description: 'Adds a public reply to a support ticket.',
      permission: 'ask_first',
      bridgeKey: 'zendesk',
      actionName: 'reply_to_ticket',
    },
    {
      kind: 'bridge_action',
      slug: 'issue-refund',
      name: 'Issue refund',
      description: 'Refunds a payment, fully or in part, to the customer’s original method.',
      permission: 'can_act',
      bridgeKey: 'stripe',
      actionName: 'create_refund',
    },
  ],
  knowledgeSuggestion: 'Your support articles',
  guard: {
    approvalRules: [
      {
        id: 'refunds-over-200',
        match: {
          action: 'Issue refund',
          conditions: [{ field: 'amount', operator: 'gt', value: 200 }],
        },
        approvers: [...ADMINS],
        waitMinutes: 480,
        onTimeout: 'reject',
        escalateTo: [],
        risk: 'high',
      },
    ],
    blockedActions: [],
  },
  guardLines: ['Refunds over $200 need approval'],
  preferredModelKeys: PREFERRED_MODELS,
}

const hrHelper: TemplateSpec = {
  key: 'hr_helper',
  name: 'HR Helper',
  description: 'Answers people questions from your HR policies and looks up leave balances.',
  instructions: [
    'You are an HR helper for employees. Answer from the HR policies you were given and name the policy you used.',
    'If a question depends on the person’s country or contract and you are not sure, say so and point to the HR team instead of guessing.',
    'Never share one employee’s personal data with another. Changes to an employee record are requested with the tool and need a person to approve them.',
  ].join('\n\n'),
  tone: 'Clear, respectful and discreet',
  conversationStarters: [
    'How many vacation days do I have left?',
    'What is the parental leave policy?',
    'How do I submit an expense?',
  ],
  creativity: 0.2,
  tools: [
    {
      kind: 'bridge_action',
      slug: 'leave-balance',
      name: 'Look up leave balance',
      description: 'Returns the vacation and sick leave balance of the person asking.',
      permission: 'read_only',
      bridgeKey: 'bamboohr',
      actionName: 'get_time_off_balance',
    },
    {
      kind: 'bridge_action',
      slug: 'update-employee-record',
      name: 'Update employee record',
      description: 'Changes a field of an employee’s record, such as an address or a bank account.',
      permission: 'ask_first',
      bridgeKey: 'bamboohr',
      actionName: 'update_employee',
    },
  ],
  knowledgeSuggestion: 'Your HR policies',
  guard: {
    approvalRules: [
      {
        id: 'record-changes',
        match: { action: 'Update employee record' },
        approvers: [...ADMINS],
        waitMinutes: 1440,
        onTimeout: 'reject',
        escalateTo: [],
        risk: 'medium',
      },
    ],
    blockedActions: [],
  },
  guardLines: ['Changes to an employee record need approval'],
  preferredModelKeys: PREFERRED_MODELS,
}

const salesAssistant: TemplateSpec = {
  key: 'sales_assistant',
  name: 'Sales Assistant',
  description: 'Prepares calls, finds contacts and deals, and drafts follow-up emails.',
  instructions: [
    'You are a sales assistant for the account team. Find the contact or deal before you answer, and use only what the CRM and the web search return.',
    'Write follow-up emails in the seller’s voice: short, specific, with one clear next step. Drafts are sent only after a person approves them.',
    'Say what you could not find instead of filling gaps.',
  ].join('\n\n'),
  tone: 'Professional and to the point',
  conversationStarters: [
    'Prepare me for my call with Acme',
    'Which deals closing this month have no next step?',
    'Draft a follow-up to the last email',
  ],
  creativity: 0.5,
  tools: [
    {
      kind: 'bridge_action',
      slug: 'find-contact',
      name: 'Find contact',
      description: 'Finds a contact or company and returns its recent activity.',
      permission: 'read_only',
      bridgeKey: 'hubspot',
      actionName: 'search_contacts',
    },
    {
      kind: 'bridge_action',
      slug: 'send-email',
      name: 'Send email',
      description: 'Sends an email from the seller’s mailbox.',
      permission: 'ask_first',
      bridgeKey: 'gmail',
      actionName: 'send_email',
    },
    {
      kind: 'web_search',
      slug: 'web-search',
      name: 'Web search',
      description: 'Searches the web for news about a company or a person’s role.',
      permission: 'read_only',
    },
  ],
  knowledgeSuggestion: 'Your product and pricing sheets',
  guard: {
    approvalRules: [
      {
        id: 'outgoing-email',
        match: { action: 'Send email' },
        approvers: [...ADMINS],
        waitMinutes: 480,
        onTimeout: 'reject',
        escalateTo: [],
        risk: 'medium',
      },
    ],
    blockedActions: [],
  },
  guardLines: ['Emails to customers need approval'],
  preferredModelKeys: PREFERRED_MODELS,
}

const invoiceChecker: TemplateSpec = {
  key: 'invoice_checker',
  name: 'Invoice Checker',
  description: 'Checks incoming invoices against orders and your purchasing policy.',
  instructions: [
    'You check supplier invoices. Compare each invoice with its purchase order: supplier, amounts, tax and payment terms. List every difference you find.',
    'Mark an invoice as paid only when everything matches. When something does not, say what and by how much, and stop.',
    'Follow the purchasing policy you were given; when it does not cover a case, ask a person.',
  ].join('\n\n'),
  tone: 'Precise and neutral',
  conversationStarters: [
    'Check the latest invoice from this supplier',
    'Which open invoices have no purchase order?',
    'Why does this invoice not match its order?',
  ],
  creativity: 0.1,
  tools: [
    {
      kind: 'bridge_action',
      slug: 'get-invoice',
      name: 'Get invoice',
      description: 'Returns an invoice with its lines, totals and linked purchase order.',
      permission: 'read_only',
      bridgeKey: 'quickbooks',
      actionName: 'get_invoice',
    },
    {
      kind: 'bridge_action',
      slug: 'mark-invoice-paid',
      name: 'Mark invoice as paid',
      description: 'Records a payment against an invoice and closes it.',
      permission: 'can_act',
      bridgeKey: 'quickbooks',
      actionName: 'record_payment',
    },
  ],
  knowledgeSuggestion: 'Your purchasing policy',
  guard: {
    approvalRules: [
      {
        id: 'large-invoices',
        match: {
          action: 'Mark invoice as paid',
          conditions: [{ field: 'amount', operator: 'gt', value: 5000 }],
        },
        approvers: [...ADMINS],
        waitMinutes: 1440,
        onTimeout: 'reject',
        escalateTo: [],
        risk: 'high',
      },
    ],
    blockedActions: [],
  },
  guardLines: ['Invoices over $5,000 need approval'],
  preferredModelKeys: PREFERRED_MODELS,
}

export const TEMPLATES: readonly TemplateSpec[] = [
  customerSupport,
  hrHelper,
  salesAssistant,
  invoiceChecker,
]
