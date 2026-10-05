// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { setupQueries } from '@/api/setup'

import { SETUP_STEP } from '../Setup.constants'
import { isEmailAvailable } from '../Setup.utils'

import type { SetupWizardStep } from '../Setup.constants'
import type { SetupOrganization } from '../Setup.types'
import type { SetupWizardProps } from './SetupWizard.types'

/** What the page shows: the status is loading or failed, setup is over, or the steps run. */
export type SetupWizardView = 'loading' | 'unavailable' | 'complete' | 'steps'

/**
 * The wizard's state: the server status decides whether setup is open (or over), the step and the
 * created organization are kept here. A signed-in Owner of an unfinished setup resumes at the
 * AI model step.
 */
export function useSetupWizardController({ resume }: SetupWizardProps) {
  const status = useQuery(setupQueries.status())
  const [step, setStep] = useState<SetupWizardStep>(resume ? SETUP_STEP.MODEL : SETUP_STEP.WELCOME)
  const [created, setCreated] = useState<SetupOrganization | null>(null)
  const [hasEmail, setHasEmail] = useState(true)

  const organization = created ?? resume
  const data = status.data

  let view: SetupWizardView = 'steps'
  if (created === null) {
    if (status.isPending) view = 'loading'
    else if (data === undefined) view = 'unavailable'
    else if (data.isComplete && !(resume !== null && data.finishedAt === null)) view = 'complete'
  }

  return {
    view,
    step,
    organization,
    hasEmail,
    status: data,
    isChecking: status.isFetching,
    onCheckAgain: () => void status.refetch(),
    onWelcomeContinue: () => {
      setHasEmail(isEmailAvailable(data?.checks ?? []))
      setStep(SETUP_STEP.ORGANIZATION)
    },
    onCreated: (next: SetupOrganization) => {
      setCreated(next)
      setStep(SETUP_STEP.MODEL)
    },
    goTo: setStep,
  }
}
