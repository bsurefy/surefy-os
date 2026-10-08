// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Pencil, Plus, ShieldCheck, X } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'

import type { AgentGuard, Approver } from '@surefy/contracts'
import { EmptyState, StatusPill } from '@surefy/ui/components/DataDisplay'
import { Banner } from '@surefy/ui/components/Feedback'
import { Section } from '@surefy/ui/components/Layout'
import { Button } from '@surefy/ui/primitives/button'

import { splitWait } from '../GuardTab.utils'

type ApprovalRule = AgentGuard['approvalRules'][number]

interface ApprovalRulesSectionProps {
  rules: readonly ApprovalRule[]
  /** Tools that can act and have no rule yet: a rule is suggested for each. */
  suggestedTools: readonly { id: string; name: string }[]
  labelOf: (approver: Approver) => string
  isReadOnly: boolean
  onAdd: (action?: string) => void
  onEdit: (rule: ApprovalRule) => void
  onRemove: (ruleId: string) => void
}

/**
 * The agent's approval rules: when an action needs a person, who decides, how long to wait and what
 * happens if nobody does. Tools that can act are offered a rule.
 */
export default function ApprovalRulesSection({
  rules,
  suggestedTools,
  labelOf,
  isReadOnly,
  onAdd,
  onEdit,
  onRemove,
}: Readonly<ApprovalRulesSectionProps>) {
  const t = useTranslations('agents.editor.guard.rules')
  const format = useFormatter()

  const waitText = (rule: ApprovalRule): string => {
    if (rule.waitMinutes === null || rule.onTimeout === null) return t('waitsForever')
    const { amount, unit } = splitWait(rule.waitMinutes)
    return t('waits', {
      duration: t(`units.${unit}`, { count: amount }),
      onTimeout: t(`onTimeout.${rule.onTimeout}`),
    })
  }

  return (
    <Section
      title={t('title')}
      description={t('description')}
      actions={
        !isReadOnly && (
          <Button
            variant="secondary"
            size="sm"
            icon={Plus}
            onClick={() => {
              onAdd()
            }}
          >
            {t('add')}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {!isReadOnly &&
          suggestedTools.map((tool) => (
            <Banner
              key={tool.id}
              tone="info"
              title={t('suggest.title', { tool: tool.name })}
              description={t('suggest.description')}
              action={
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    onAdd(tool.name)
                  }}
                >
                  {t('suggest.add', { tool: tool.name })}
                </Button>
              }
            />
          ))}
        {rules.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            headingLevel={3}
            title={t('empty.title')}
            description={t('empty.description')}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {rules.map((rule) => (
              <li
                key={rule.id}
                className="border-border flex items-start gap-3 rounded-lg border px-3 py-2"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-body text-foreground font-medium">
                    {t('ask', { action: rule.match.action })}
                  </span>
                  <span className="text-caption text-muted-foreground">
                    {t('approvers', {
                      names: format.list(rule.approvers.map(labelOf), { type: 'disjunction' }),
                    })}
                  </span>
                  <span className="text-caption text-muted-foreground">{waitText(rule)}</span>
                </div>
                <StatusPill
                  tone={
                    { low: 'neutral', medium: 'warning', high: 'destructive' }[rule.risk] as
                      'neutral' | 'warning' | 'destructive'
                  }
                  label={t(`risk.${rule.risk}`)}
                />
                {!isReadOnly && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={Pencil}
                      aria-label={t('edit', { action: rule.match.action })}
                      onClick={() => {
                        onEdit(rule)
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={X}
                      aria-label={t('remove', { action: rule.match.action })}
                      onClick={() => {
                        onRemove(rule.id)
                      }}
                    />
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  )
}
