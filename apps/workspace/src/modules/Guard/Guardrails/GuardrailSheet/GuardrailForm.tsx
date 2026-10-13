// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Lock, LockOpen } from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { GuardrailDto, GuardrailType } from '@surefy/contracts'
import { Banner } from '@surefy/ui/components/Feedback'
import { SidePanel } from '@surefy/ui/components/Overlay'
import { Button } from '@surefy/ui/primitives/button'
import { Form } from '@surefy/ui/primitives/form'

import GuardReasonDialog from '../../GuardReasonDialog'
import { GuardrailChangeDialog } from '../GuardrailDialogs'
import { SHEET_FORM_ID } from '../Guardrails.constants'
import ActionLimitFields from './fields/ActionLimitFields'
import ApprovalRuleFields from './fields/ApprovalRuleFields'
import CommonFields from './fields/CommonFields'
import ContentFilterFields from './fields/ContentFilterFields'
import MatchFields from './fields/MatchFields'
import ThresholdOverrideFields from './fields/ThresholdOverrideFields'
import { useGuardrailFormController } from './GuardrailSheet.controller'

interface GuardrailFormProps {
  /** The guardrail being edited; null when adding one. */
  guardrail: GuardrailDto | null
  initialType: GuardrailType
  canManage: boolean
  canLock: boolean
  onOpenRule: (id: string) => void
  onClose: () => void
}

/**
 * The guardrail sheet: add (with a type picker) or edit. The common fields, which actions the
 * rule covers, and the fields of its type. Locked and read-only rules show why they cannot change.
 */
export default function GuardrailForm(props: Readonly<GuardrailFormProps>) {
  const { guardrail, onClose, onOpenRule } = props
  const c = useGuardrailFormController(props)
  const { t, form, values } = c
  const tTypes = useTranslations('guard.guardrails.types')
  const type = values.type ?? props.initialType

  const saveLabel = c.isNew ? t('add') : t('save')
  const footer = c.canEdit ? (
    <div className="flex w-full flex-wrap items-center gap-2">
      {!c.isNew && (
        <Button type="button" variant="ghost" className="text-destructive" onClick={c.onDelete}>
          {t('delete')}
        </Button>
      )}
      {!c.isNew && c.canLock && guardrail && (
        <Button
          type="button"
          variant="ghost"
          icon={guardrail.isLocked ? LockOpen : Lock}
          isLoading={c.isUnlocking}
          onClick={guardrail.isLocked ? c.onUnlock : c.onLock}
        >
          {guardrail.isLocked ? t('lock.unlock') : t('lock.lock')}
        </Button>
      )}
      <span className="ml-auto flex gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          {t('cancel')}
        </Button>
        <Button type="submit" form={SHEET_FORM_ID} isLoading={c.isSaving}>
          {c.saveFailed ? t('saveFailed') : saveLabel}
        </Button>
      </span>
    </div>
  ) : (
    <div className="flex w-full flex-wrap items-center gap-2">
      {!c.isNew && c.canLock && guardrail && (
        <Button
          type="button"
          variant="ghost"
          icon={LockOpen}
          isLoading={c.isUnlocking}
          onClick={c.onUnlock}
        >
          {t('lock.unlock')}
        </Button>
      )}
      <Button type="button" variant="secondary" className="ml-auto" onClick={onClose}>
        {t('close')}
      </Button>
    </div>
  )

  const lockedBy = guardrail?.lockedBy?.name ?? ''
  const lockedReason = guardrail?.lockedReason ?? ''

  return (
    <>
      <SidePanel
        open
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
        title={guardrail ? guardrail.name : t('addTitle')}
        description={guardrail ? tTypes(guardrail.type) : t('addDescription')}
        footer={footer}
      >
        {guardrail?.isLocked && (
          <Banner
            tone="info"
            title={t(c.canLock ? 'lock.bannerLocked' : 'lock.bannerLockedAdmin', {
              name: lockedBy,
              reason: lockedReason,
            })}
          />
        )}
        {!props.canManage && (
          <Banner tone="info" title={t('readOnly.title')} description={t('readOnly.description')} />
        )}
        {guardrail?.conflictsWith && (
          <Banner
            tone="warning"
            title={t('conflict.title')}
            description={t('conflict.description', { name: guardrail.conflictsWith.name })}
            action={
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  if (guardrail.conflictsWith) onOpenRule(guardrail.conflictsWith.id)
                }}
              >
                {t('conflict.open')}
              </Button>
            }
          />
        )}
        {c.formError && <Banner tone="destructive" title={c.formError} isAnnounced />}
        <Form {...form}>
          <form id={SHEET_FORM_ID} noValidate onSubmit={c.onSubmit} className="flex flex-col gap-6">
            <CommonFields
              control={form.control}
              scope={values.scope ?? 'organization'}
              isNew={c.isNew}
              isReadOnly={!c.canEdit}
            />
            <MatchFields control={form.control} isReadOnly={!c.canEdit} />
            {type === 'approval_rule' && (
              <ApprovalRuleFields
                control={form.control}
                waits={values.waits ?? false}
                onTimeout={values.onTimeout ?? 'reject'}
                isReadOnly={!c.canEdit}
              />
            )}
            {type === 'threshold_override' && (
              <ThresholdOverrideFields control={form.control} isReadOnly={!c.canEdit} />
            )}
            {type === 'blocked_action' && (
              <p className="text-body text-foreground-secondary">{t('blocked.help')}</p>
            )}
            {type === 'action_limit' && (
              <ActionLimitFields
                control={form.control}
                currency={c.currency}
                isReadOnly={!c.canEdit}
              />
            )}
            {type === 'content_filter' && (
              <ContentFilterFields
                control={form.control}
                selected={values.categories ?? []}
                isReadOnly={!c.canEdit}
              />
            )}
          </form>
        </Form>
      </SidePanel>
      {guardrail && c.pending?.kind === 'loosen' && (
        <GuardrailChangeDialog
          guardrailId={guardrail.id}
          title={t('saveConfirm.title', { name: guardrail.name })}
          description={t('saveConfirm.description')}
          confirmLabel={t('saveConfirm.confirm')}
          tone="primary"
          error={c.dialogError}
          onClose={c.onClosePending}
          onConfirm={c.onConfirmLoosen}
        />
      )}
      {guardrail && c.pending?.kind === 'delete' && (
        <GuardrailChangeDialog
          guardrailId={guardrail.id}
          title={t('deleteConfirm.title', { name: guardrail.name })}
          description={t('deleteConfirm.description')}
          confirmLabel={t('deleteConfirm.confirm')}
          error={c.dialogError}
          onClose={c.onClosePending}
          onConfirm={c.onConfirmDelete}
        />
      )}
      {guardrail && c.pending?.kind === 'lock' && (
        <GuardReasonDialog
          open
          onOpenChange={(open) => {
            if (!open) c.onClosePending()
          }}
          title={t('lock.dialogTitle', { name: guardrail.name })}
          description={t('lock.dialogDescription')}
          isReasonRequired
          tone="primary"
          labels={{
            confirm: t('lock.confirm'),
            reason: t('lock.reason'),
            reasonHelp: t('lock.reasonHelp'),
            reasonRequired: t('lock.reasonRequired'),
          }}
          error={c.dialogError}
          onConfirm={({ reason }) => c.onConfirmLock(reason ?? '')}
        />
      )}
    </>
  )
}
