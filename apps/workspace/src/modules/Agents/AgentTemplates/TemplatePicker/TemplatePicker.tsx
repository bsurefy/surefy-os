// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Plus } from 'lucide-react'

import { IconTile } from '@surefy/ui/components/DataDisplay'
import { Banner, ErrorState, Skeleton } from '@surefy/ui/components/Feedback'
import { Button } from '@surefy/ui/primitives/button'

import { TEMPLATE_SKELETON_COUNT } from '../AgentTemplates.constants'
import TemplateCard from '../TemplateCard'
import { SCRATCH_KEY, useTemplatePickerController } from './TemplatePicker.controller'

/**
 * The four templates and "Start from scratch". Choosing one creates the agent and opens its
 * editor; the Agents list shows the same picker when there are no agents yet.
 */
export default function TemplatePicker() {
  const c = useTemplatePickerController()
  const { t } = c
  const isBusy = c.creatingKey !== null

  if (c.errorMessage) {
    return (
      <ErrorState
        title={t('loadError')}
        message={c.errorMessage}
        reference={c.errorReference}
        onRetry={c.refetch}
      />
    )
  }

  return (
    <section aria-busy={c.isLoading || undefined} className="flex flex-col gap-4">
      {c.createError && (
        <Banner
          tone="destructive"
          title={t('createError')}
          description={c.createError}
          onDismiss={c.onDismissError}
          isAnnounced
        />
      )}
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {c.isLoading &&
          Array.from({ length: TEMPLATE_SKELETON_COUNT }, (_, index) => (
            <li key={index}>
              <Skeleton className="h-72 w-full rounded-xl" />
            </li>
          ))}
        {c.templates.map((template) => (
          <TemplateCard
            key={template.key}
            template={template}
            canInstallBridges={c.canInstallBridges}
            isCreating={c.creatingKey === template.key}
            isDisabled={isBusy || !c.canCreate}
            onUse={(chosen) => void c.onUse(chosen)}
          />
        ))}
        {!c.isLoading && (
          <li className="border-border bg-surface flex flex-col gap-4 rounded-xl border border-dashed p-4">
            <div className="flex items-start gap-3">
              <IconTile icon={Plus} />
              <div className="flex min-w-0 flex-col gap-1">
                <h3 className="text-body font-semibold">{t('scratch.title')}</h3>
                <p className="text-label text-foreground-secondary">{t('scratch.description')}</p>
              </div>
            </div>
            <Button
              variant="secondary"
              className="mt-auto"
              isLoading={c.creatingKey === SCRATCH_KEY}
              disabled={isBusy || !c.canCreate}
              onClick={() => void c.onStartFromScratch()}
            >
              {t('scratch.use')}
            </Button>
          </li>
        )}
      </ul>
    </section>
  )
}
