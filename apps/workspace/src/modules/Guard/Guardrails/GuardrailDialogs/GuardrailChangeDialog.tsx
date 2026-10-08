// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { guardQueries } from '@/api/guard'
import type { GuardrailImpactDto } from '@surefy/contracts'
import { Button } from '@surefy/ui/primitives/button'
import { useCurrentOrgId } from '@surefy/web-core/access'

import GuardReasonDialog from '../../GuardReasonDialog'
import { getDependentCounts } from '../Guardrails.utils'

import type { ReactNode } from 'react'

const IMPACT_KEYS = { agent: 'impact.agents', flow: 'impact.flows' } as const

type Translate = ReturnType<typeof useTranslations<'guard.guardrails'>>

/** "Affects 3 agents", one line per kind of dependent; one line saying nothing uses it. */
function describeImpact(impact: GuardrailImpactDto, t: Translate): string[] {
  const counts = getDependentCounts(impact)
  if (counts.length === 0) return [t('impact.none')]
  return counts.map(({ type, count }) => {
    const key = type === 'agent' || type === 'flow' ? IMPACT_KEYS[type] : 'impact.other'
    return t(key, { count })
  })
}

export interface GuardrailChangeDialogProps {
  guardrailId: string
  title: string
  description: string
  confirmLabel: string
  tone?: 'destructive' | 'primary'
  /** Why the change failed; the dialog stays open. */
  error?: ReactNode
  onClose: () => void
  /** Rejects when the change fails. */
  onConfirm: (reason: string) => Promise<unknown>
}

/**
 * Turning a guardrail off, loosening it or deleting it (T2): says which agents and flows it
 * reaches ("Affects 3 agents") and asks for the reason that goes to the audit log.
 */
export default function GuardrailChangeDialog({
  guardrailId,
  title,
  description,
  confirmLabel,
  tone = 'destructive',
  error,
  onClose,
  onConfirm,
}: Readonly<GuardrailChangeDialogProps>) {
  const t = useTranslations('guard.guardrails')
  const orgId = useCurrentOrgId()
  const impact = useQuery(guardQueries.guardrailImpact(orgId, guardrailId))

  const lines: ReactNode[] = impact.data ? describeImpact(impact.data, t) : []
  if (impact.error) {
    lines.push(
      <span key="unavailable" className="inline-flex flex-wrap items-center gap-2">
        {t('impact.unavailable')}
        <Button
          variant="link"
          size="sm"
          onClick={() => {
            void impact.refetch()
          }}
        >
          {t('impact.retry')}
        </Button>
      </span>,
    )
  }

  return (
    <GuardReasonDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={title}
      description={description}
      impact={lines}
      isReasonRequired
      tone={tone}
      labels={{
        confirm: confirmLabel,
        reason: t('reason.label'),
        reasonHelp: t('reason.help'),
        reasonRequired: t('reason.required'),
      }}
      error={error}
      onConfirm={({ reason }) => onConfirm(reason ?? '')}
    />
  )
}
