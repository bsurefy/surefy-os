// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useFormatter } from 'next-intl'

import { Banner } from '@surefy/ui/components/Feedback'
import { Section } from '@surefy/ui/components/Layout'
import { ConfirmDialog } from '@surefy/ui/components/Overlay'
import { Button } from '@surefy/ui/primitives/button'

import { useDeleteOrganizationSectionController } from './DeleteOrganizationSection.controller'

/** Delete organization: T3, then a 30-day hold the Owner can cancel. */
export default function DeleteOrganizationSection() {
  const c = useDeleteOrganizationSectionController()
  const format = useFormatter()
  const { t } = c

  return (
    <Section title={t('title')} description={t('description')}>
      {c.scheduled?.scheduledFor ? (
        <Banner
          tone="warning"
          title={t('scheduled.title', {
            date: format.dateTime(new Date(c.scheduled.scheduledFor), { dateStyle: 'long' }),
          })}
          description={t('scheduled.description')}
          action={
            <Button variant="secondary" size="sm" isLoading={c.isCanceling} onClick={c.onCancel}>
              {t('scheduled.cancel')}
            </Button>
          }
        />
      ) : (
        <Button
          variant="destructive"
          className="self-start"
          aria-disabled={!c.organizationName}
          onClick={c.organizationName ? c.onOpenConfirm : undefined}
        >
          {t('open')}
        </Button>
      )}
      {c.organizationName && (
        <ConfirmDialog
          open={c.isConfirming}
          onOpenChange={(open) => {
            if (!open) c.onCloseConfirm()
          }}
          tier="T3"
          tone="destructive"
          title={t('confirmTitle', { name: c.organizationName })}
          description={t('confirmDescription')}
          impact={[t('impactHold'), t('impactExport'), t('impactReauth')]}
          confirmationText={c.organizationName}
          labels={{
            confirm: t('confirm'),
            reason: t('reason'),
            reasonHelp: t('reasonHelp'),
            reasonRequired: t('reasonRequired'),
            typeToConfirm: (name) => t('typeToConfirm', { name }),
            typeMismatch: (name) => t('typeMismatch', { name }),
          }}
          error={c.createError}
          onConfirm={c.onDelete}
        />
      )}
    </Section>
  )
}
