// SPDX-License-Identifier: AGPL-3.0-only
import { useTranslations } from 'next-intl'

import { Banner, Skeleton } from '@surefy/ui/components/Feedback'
import { Combobox } from '@surefy/ui/components/Forms'
import type { ComboboxOption } from '@surefy/ui/components/Forms'
import { Section } from '@surefy/ui/components/Layout'
import { Label } from '@surefy/ui/primitives/label'

export interface EmbeddingModelSectionProps {
  current: { id: string; displayName: string; dimensions: number | null } | null
  options: ComboboxOption[]
  isLoading: boolean
  isSaving: boolean
  onChange: (modelId: string) => void
}

/**
 * The organization's default embedding model for knowledge bases created afterwards. Without one,
 * the warning says what is blocked: "Knowledge uploads need an embedding model".
 */
export default function EmbeddingModelSection({
  current,
  options,
  isLoading,
  isSaving,
  onChange,
}: Readonly<EmbeddingModelSectionProps>) {
  const t = useTranslations('vault.modelAccess.embedding')

  return (
    <Section title={t('title')} description={t('description')}>
      {isLoading ? (
        <Skeleton className="h-9 w-full max-w-sm" />
      ) : (
        <div className="flex flex-col gap-3">
          {current === null && (
            <Banner
              tone="warning"
              title={t('missingTitle')}
              description={options.length === 0 ? t('missingNoModels') : t('missingChoose')}
            />
          )}
          <div className="flex max-w-sm flex-col gap-1.5">
            <Label htmlFor="embedding-model" className="sr-only">
              {t('title')}
            </Label>
            <Combobox
              id="embedding-model"
              aria-describedby="embedding-help"
              options={options}
              value={current?.id ?? null}
              onValueChange={(value) => {
                if (value) onChange(value)
              }}
              isDisabled={isSaving || options.length === 0}
              labels={{
                placeholder: t('placeholder'),
                search: t('search'),
                empty: t('empty'),
              }}
            />
            <p id="embedding-help" className="text-caption text-muted-foreground">
              {current?.dimensions ? t('dimensions', { count: current.dimensions }) : t('help')}
            </p>
          </div>
        </div>
      )}
    </Section>
  )
}
