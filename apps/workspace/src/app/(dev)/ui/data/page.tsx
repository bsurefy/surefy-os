// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Bot, Plus } from 'lucide-react'

import {
  CodeBlock,
  DataLocationBadge,
  EditionBadge,
  EmptyState,
  Markdown,
  Meter,
  ProviderChip,
  ReasoningPanel,
  StatCard,
  StatusPill,
  Tag,
  VerifiedBadge,
} from '@surefy/ui/components/DataDisplay'
import { PageHeader, Section, Stack } from '@surefy/ui/components/Layout'
import { Badge } from '@surefy/ui/primitives/badge'
import { Button } from '@surefy/ui/primitives/button'

import ChartsDemo from './ChartsDemo'
import TableDemo from './TableDemo'

const codeLabels = { copy: 'Copy', copied: 'Copied' }
// A fake key, assembled so secret scanners do not flag the source; the code block masks it.
const FAKE_KEY = ['sk', 'live', 'a1b2c3d4e5f6g7h8i9j0'].join('-')

const ANSWER = `# Refund policy

Customers can ask for a refund **within 30 days** of purchase.

## Steps

1. Check the order in the billing system.
2. Confirm the reason with the customer.
3. Issue the refund and add a note.

| Plan | Refund window |
| --- | --- |
| Monthly | 30 days |
| Annual | 60 days |

Use \`refunds.create\` from the API:

\`\`\`ts
await client.refunds.create({ orderId: 'ord_2041', reason: 'duplicate' })
\`\`\`

See [the handbook](https://example.com/handbook) for edge cases.`

export default function DataShowcase() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6">
      <Stack gap={6}>
        <PageHeader
          title="Data display"
          description="Tables, empty states, metrics, charts, code, Markdown and the trust components."
        />

        <Section title="Status and badges">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill label="Active" tone="success" />
            <StatusPill label="Running" tone="info" isPulsing />
            <StatusPill label="Succeeded" tone="success" />
            <StatusPill label="Failed" tone="destructive" />
            <StatusPill label="Waiting for approval" tone="warning" />
            <StatusPill label="Draft" tone="neutral" />
            <StatusPill label="Paused" tone="neutral" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>New</Badge>
            <Badge variant="primary">Beta</Badge>
            <Badge variant="outline">Preview</Badge>
            <Tag>v1.2.0</Tag>
            <Tag>MCP</Tag>
            <Tag>org_</Tag>
            <EditionBadge label="Enterprise" />
            <EditionBadge label="Cloud" />
          </div>
        </Section>

        <Section title="Metrics">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Active members"
              value="1,284"
              delta={{ label: '+6 this quarter', direction: 'up', tone: 'positive' }}
              sparkline={[4, 6, 5, 8, 9, 12, 14]}
              href="#members"
            />
            <StatCard
              label="Spend this month"
              value="$2,480"
              delta={{ label: '+18% vs last month', direction: 'up', tone: 'negative' }}
              sparkline={[10, 12, 11, 15, 14, 18, 21]}
            />
            <StatCard
              label="Answer accuracy"
              value="94%"
              delta={{ label: 'No change', direction: 'flat' }}
            />
            <StatCard label="Budget left" value="0" isRestricted restrictedLabel="Restricted" />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Meter label="Seats" value={212} max={400} valueText="212 of 400 seats" />
            <Meter label="Storage" value={84} max={100} valueText="84 of 100 GB" />
            <Meter label="Credits" value={1040} max={1000} valueText="1,040 of 1,000 credits" />
          </div>
        </Section>

        <TableDemo />
        <ChartsDemo />

        <Section title="Empty states">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="border-border rounded-lg border border-dashed">
              <EmptyState
                headingLevel={3}
                icon={Bot}
                title="Create your first agent"
                description="Agents answer questions and take actions using your tools and knowledge, with approval rules you choose."
                actionLabel="Create agent"
                onAction={() => {
                  // The showcase has nowhere to go.
                }}
                secondaryAction={<Button variant="secondary">Browse templates</Button>}
              />
            </div>
            <div className="border-border rounded-lg border border-dashed">
              <EmptyState
                headingLevel={3}
                icon={Plus}
                title="No agents yet"
                description="Agents your team creates appear here."
                note="Ask an admin to create an agent."
              />
            </div>
          </div>
        </Section>

        <Section title="Code block" description="Copy button, language label, secrets masked.">
          <CodeBlock
            language="bash"
            labels={codeLabels}
            code={`curl https://surefy.example.com/api/v1/chats \\\n  -H "Authorization: Bearer ${FAKE_KEY}"`}
          />
        </Section>

        <Section title="Markdown" description="AI answers and documents; no raw HTML.">
          <Markdown codeLabels={codeLabels}>{ANSWER}</Markdown>
        </Section>

        <Section title="Trust components">
          <div className="flex flex-wrap items-center gap-2">
            <VerifiedBadge label="Approved by Ana Ruiz · Oct 4, 10:42 UTC" href="#audit-a1" />
            <DataLocationBadge location="local" label="Stays on your server" />
            <DataLocationBadge location="provider" label="Sent to OpenAI" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ProviderChip name="OpenAI" status="connected" statusLabel="Connected" />
            <ProviderChip name="Anthropic" status="expiring" statusLabel="Key expires in 5 days" />
            <ProviderChip name="Mistral" status="rate-limited" statusLabel="Rate limited" />
            <ProviderChip name="Gemini" status="error" statusLabel="Error" />
            <ProviderChip name="Cohere" status="not-connected" statusLabel="Not connected" />
            <ProviderChip name="Ollama" status="connected" statusLabel="Connected" isLocal />
          </div>
          <ReasoningPanel
            labels={{
              title: 'Why the AI suggests this',
              sources: 'Sources',
              run: 'See the full run',
            }}
            reasons={[
              { text: 'The invoice total matches the purchase order', confidence: '96%' },
              { text: 'The supplier is on the approved list', confidence: '91%' },
              { text: 'The due date is within the payment terms', confidence: '72%' },
            ]}
            sources={[
              { label: 'invoice-2041.pdf', href: '#doc-1' },
              { label: 'PO-7781', href: '#doc-2' },
            ]}
            runHref="#run-r1"
          />
        </Section>
      </Stack>
    </main>
  )
}
