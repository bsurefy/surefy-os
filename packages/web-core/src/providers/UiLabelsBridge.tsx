// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import { UiLabelsProvider } from '@surefy/ui/lib/labels'
import type { UiLabels } from '@surefy/ui/lib/labels'

import { UI_LABEL_KEYS } from './providers.constants'

import type { ReactNode } from 'react'

/**
 * `@surefy/ui` does not depend on next-intl: its built-in labels ("Close", "Try again", "Copy"…)
 * come from the shared `common` namespace through `UiLabelsProvider`, and form message keys are
 * translated with the `validation` namespace.
 */
export function UiLabelsBridge({ children }: Readonly<{ children: ReactNode }>) {
  const t = useTranslations('common')
  const tValidation = useTranslations('validation')
  const labels: Partial<UiLabels> = {}
  for (const key of UI_LABEL_KEYS) labels[key] = t(key)
  // FormMessage shows `issues.<code>` (server errors) and `custom.<key>` (refines) as keys.
  const translateMessage = (text: string) => (tValidation.has(text) ? tValidation(text) : text)
  return (
    <UiLabelsProvider labels={labels} translateMessage={translateMessage}>
      {children}
    </UiLabelsProvider>
  )
}
