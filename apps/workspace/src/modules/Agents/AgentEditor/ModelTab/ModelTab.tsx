// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { DataLocationBadge } from '@surefy/ui/components/DataDisplay'
import { Banner, ErrorState } from '@surefy/ui/components/Feedback'
import { Combobox, Field, SliderInput, SwitchField } from '@surefy/ui/components/Forms'
import { Section } from '@surefy/ui/components/Layout'

import { useModelTabController } from './ModelTab.controller'

import type { ModelTabProps } from './ModelTab.types'

/**
 * Model: only the models the person may use (with cost and where the data goes), creativity, the
 * model that double-checks risky actions, and the Vault fallback for private conversations.
 */
export default function ModelTab(props: Readonly<ModelTabProps>) {
  const c = useModelTabController(props)
  const { t } = c
  const { isReadOnly } = props
  const labels = {
    placeholder: t('picker.placeholder'),
    search: t('picker.search'),
    empty: t('picker.empty'),
    loading: t('picker.loading'),
  }

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
    <div className="flex max-w-2xl flex-col gap-6">
      {c.isUnavailable && (
        <Banner
          tone="warning"
          title={t('unavailable.title')}
          description={t('unavailable.description')}
        />
      )}
      <Section title={t('model.title')} description={t('model.description')}>
        <div className="flex flex-col gap-4">
          <Field label={t('model.label')}>
            <Combobox
              options={c.modelOptions}
              labels={labels}
              value={c.modelKey}
              onValueChange={c.onModelChange}
              isLoading={c.isLoading}
              isDisabled={isReadOnly}
            />
          </Field>
          {c.selected && (
            <DataLocationBadge
              location={c.selected.dataLocation === 'on_server' ? 'local' : 'provider'}
              label={
                c.selected.dataLocation === 'on_server'
                  ? t('dataLocation.local')
                  : t('dataLocation.provider', { provider: c.selected.providerKey })
              }
            />
          )}
          <Field label={t('creativity.label')} description={t('creativity.help')}>
            <SliderInput
              label={t('creativity.label')}
              value={c.creativityPercent}
              onValueChange={c.onCreativityChange}
              min={0}
              max={100}
              step={5}
              suffix="%"
              isDisabled={isReadOnly}
            />
          </Field>
        </div>
      </Section>
      <Section title={t('safety.title')} description={t('safety.description')}>
        <div className="flex flex-col gap-4">
          <Field label={t('doubleCheck.label')} description={t('doubleCheck.help')}>
            <Combobox
              options={c.doubleCheckOptions}
              labels={labels}
              value={c.doubleCheckKey}
              onValueChange={c.onDoubleCheckChange}
              isLoading={c.isLoading}
              isDisabled={isReadOnly}
            />
          </Field>
          <SwitchField
            label={t('fallback.label')}
            description={t('fallback.help')}
            checked={c.useVaultFallback}
            onCheckedChange={c.onVaultFallbackChange}
            disabled={isReadOnly}
          />
        </div>
      </Section>
    </div>
  )
}
