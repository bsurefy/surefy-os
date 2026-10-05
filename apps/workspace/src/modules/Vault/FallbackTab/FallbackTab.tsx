// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Lock } from 'lucide-react'

import { FALLBACK_TIMEOUT_SECONDS } from '@surefy/contracts'
import { Banner, ErrorState, Skeleton } from '@surefy/ui/components/Feedback'
import { Combobox, NumberInput, SaveBar, SwitchField } from '@surefy/ui/components/Forms'
import { Section } from '@surefy/ui/components/Layout'
import { Label } from '@surefy/ui/primitives/label'

import FallbackOrder from './FallbackOrder'
import { useFallbackTabController } from './FallbackTab.controller'

/**
 * Vault › Fallback: ordered models, a live "requests go to…" preview, when to fall back, and the
 * locked "Private chats stay on local models" rule. What happens at a budget limit lives in Usage.
 */
export default function FallbackTab() {
  const c = useFallbackTabController()
  const { t } = c

  if (c.errorMessage) {
    return (
      <ErrorState
        size="sm"
        title={t('loadError')}
        message={c.errorMessage}
        reference={c.errorReference}
        onRetry={c.refetch}
      />
    )
  }
  if (c.isLoading || !c.fallback) return <Skeleton className="h-64 w-full" />

  const chainNames = c.chain.map((entry) => entry.displayName ?? entry.modelKey)

  return (
    <div className="flex flex-col gap-6">
      {c.saveError && <Banner tone="destructive" title={c.saveError} isAnnounced />}
      <Section title={t('orderTitle')} description={t('orderDescription')}>
        <div className="flex flex-col gap-4">
          <p className="text-body" aria-live="polite">
            {chainNames.length === 0
              ? t('previewNone')
              : t('preview', { chain: chainNames.join(' → ') })}
          </p>
          {c.entries.length === 0 ? (
            <p className="text-body text-muted-foreground">{t('empty')}</p>
          ) : (
            <FallbackOrder entries={c.entries} onMove={c.onMove} onRemove={c.onRemove} />
          )}
          <div className="flex max-w-sm flex-col gap-1.5">
            <Label htmlFor="fallback-add-model" className="sr-only">
              {t('addModel')}
            </Label>
            <Combobox
              id="fallback-add-model"
              options={c.addOptions}
              value={null}
              onValueChange={(value) => {
                if (value) c.onAdd(value)
              }}
              isDisabled={c.isFull || c.addOptions.length === 0}
              labels={{
                placeholder: t('addModel'),
                search: t('searchModels'),
                empty: t('noModels'),
              }}
            />
          </div>
        </div>
      </Section>
      <Section title={t('whenTitle')} description={t('whenDescription')}>
        <div className="flex flex-col gap-4">
          <SwitchField
            label={t('onProviderError')}
            description={t('onProviderErrorHelp')}
            checked={c.fallback.onProviderError}
            onCheckedChange={c.onProviderErrorChange}
          />
          <SwitchField
            label={t('timeout')}
            description={t('timeoutHelp')}
            checked={c.fallback.timeoutSeconds !== null}
            onCheckedChange={c.onTimeoutEnabledChange}
          />
          {c.fallback.timeoutSeconds !== null && (
            <div className="max-w-48">
              <NumberInput
                aria-label={t('timeoutSeconds')}
                value={c.fallback.timeoutSeconds}
                onValueChange={c.onTimeoutChange}
                min={FALLBACK_TIMEOUT_SECONDS.min}
                max={FALLBACK_TIMEOUT_SECONDS.max}
                suffix={t('seconds')}
              />
            </div>
          )}
          <div className="flex items-start gap-2">
            <Lock aria-hidden className="text-muted-foreground mt-1 size-4" />
            <SwitchField
              label={t('privateLocalOnly')}
              description={t('privateLocalOnlyHelp')}
              checked
              disabled
            />
          </div>
        </div>
      </Section>
      <SaveBar
        isDirty={c.isDirty}
        isSaving={c.isSaving}
        onDiscard={c.onDiscard}
        onSave={c.onSave}
        labels={{ message: t('unsaved'), discard: t('discard'), save: t('save') }}
      />
    </div>
  )
}
