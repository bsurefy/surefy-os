// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import { ProgressBar } from '@surefy/ui/components/Feedback'

import { SETUP_STEPS } from '../Setup.constants'

import type { SetupWizardStep } from '../Setup.constants'

/** The progress bar with the current step's name above the form (auth-and-setup.md §2). */
export default function StepProgress({ step }: Readonly<{ step: SetupWizardStep }>) {
  const t = useTranslations('setup.wizard.progress')
  const current = SETUP_STEPS.indexOf(step) + 1
  const total = SETUP_STEPS.length
  return (
    <ProgressBar
      label={t(`steps.${step}`)}
      value={(current / total) * 100}
      valueText={t('step', { current, total })}
    />
  )
}
