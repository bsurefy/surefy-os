// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import type { GuardRuleRowDto } from '@surefy/contracts'
import { ErrorState, SkeletonForm } from '@surefy/ui/components/Feedback'
import { SidePanel } from '@surefy/ui/components/Overlay'
import { Button } from '@surefy/ui/primitives/button'

import { ADDABLE_TYPES, NEW_RULE } from '../Guardrails.constants'
import GuardrailForm from './GuardrailForm'
import { useGuardrailLoad } from './GuardrailSheet.controller'
import RuleSummary from './RuleSummary'

interface GuardrailSheetProps {
  /** A guardrail id, or `new` to add one. */
  ruleId: string
  /** The table row for this id, when it is among the loaded rows. */
  row: GuardRuleRowDto | undefined
  canManage: boolean
  canLock: boolean
  onOpenRule: (id: string) => void
  onClose: () => void
}

/**
 * Opens a rule: the editor for a stored guardrail, the editor with a type picker for a new one,
 * and a read-only summary with a link for rules edited elsewhere (agents, flows, data filters).
 */
export default function GuardrailSheet({
  ruleId,
  row,
  canManage,
  canLock,
  onOpenRule,
  onClose,
}: Readonly<GuardrailSheetProps>) {
  const t = useTranslations('guard.guardrails.sheet')
  const isNew = ruleId === NEW_RULE
  const isElsewhere = row?.editTarget != null
  const load = useGuardrailLoad(ruleId, !isNew && !isElsewhere)

  if (row && isElsewhere) return <RuleSummary row={row} onClose={onClose} />
  if (isNew) {
    return (
      <GuardrailForm
        guardrail={null}
        initialType={ADDABLE_TYPES[0]}
        canManage={canManage}
        canLock={canLock}
        onOpenRule={onOpenRule}
        onClose={onClose}
      />
    )
  }
  if (load.guardrail) {
    return (
      <GuardrailForm
        key={load.guardrail.id}
        guardrail={load.guardrail}
        initialType={load.guardrail.type}
        canManage={canManage}
        canLock={canLock}
        onOpenRule={onOpenRule}
        onClose={onClose}
      />
    )
  }

  return (
    <SidePanel
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={row?.name ?? t('addTitle')}
      footer={
        <Button type="button" variant="secondary" className="ml-auto" onClick={onClose}>
          {t('close')}
        </Button>
      }
    >
      {load.isLoading && <SkeletonForm />}
      {load.isNotFound && <p className="text-body text-foreground-secondary">{t('notFound')}</p>}
      {load.errorMessage && !load.isNotFound && (
        <ErrorState
          title={t('loadError')}
          message={load.errorMessage}
          reference={load.errorReference}
          onRetry={load.refetch}
        />
      )}
    </SidePanel>
  )
}
