// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import { ErrorState, Spinner } from '@surefy/ui/components/Feedback'

import AlreadyComplete from '../AlreadyComplete'
import ModelStep from '../ModelStep'
import OrganizationStep from '../OrganizationStep'
import ReadyStep from '../ReadyStep'
import { SETUP_STEP } from '../Setup.constants'
import StepProgress from '../StepProgress'
import WelcomeStep from '../WelcomeStep'
import { useSetupWizardController } from './SetupWizard.controller'

import type { SetupWizardProps } from './SetupWizard.types'

/**
 * The self-host first-run wizard (auth-and-setup.md §2): one step per screen with the progress bar
 * above it. It is not offered on phones. Once setup is over, `/setup` says so.
 */
export default function SetupWizard(props: Readonly<SetupWizardProps>) {
  const c = useSetupWizardController(props)
  const t = useTranslations('setup.wizard')

  if (c.view === 'loading') {
    return (
      <div role="status" className="text-body text-muted-foreground flex items-center gap-2">
        <Spinner />
        {t('loading')}
      </div>
    )
  }

  if (c.view === 'unavailable') {
    return (
      <ErrorState
        size="sm"
        title={t('unavailable.title')}
        message={t('unavailable.message')}
        onRetry={c.onCheckAgain}
      />
    )
  }

  if (c.view === 'complete') return <AlreadyComplete organization={props.resume} />

  return (
    <>
      <div className="flex flex-col gap-2 md:hidden">
        <h1 className="text-page-title">{t('phone.title')}</h1>
        <p className="text-body text-muted-foreground">{t('phone.description')}</p>
      </div>
      <div className="hidden flex-col gap-6 md:flex">
        <StepProgress step={c.step} />
        {c.step === SETUP_STEP.WELCOME && (
          <WelcomeStep
            checks={c.status?.checks ?? []}
            isChecking={c.isChecking}
            onCheckAgain={c.onCheckAgain}
            onContinue={c.onWelcomeContinue}
          />
        )}
        {c.step === SETUP_STEP.ORGANIZATION && (
          <OrganizationStep
            requiresToken={c.status?.requiresToken ?? false}
            onBack={() => {
              c.goTo(SETUP_STEP.WELCOME)
            }}
            onCreated={c.onCreated}
            onAlreadyComplete={c.onCheckAgain}
          />
        )}
        {c.step === SETUP_STEP.MODEL && c.organization && (
          <ModelStep
            orgId={c.organization.id}
            onContinue={() => {
              c.goTo(SETUP_STEP.READY)
            }}
          />
        )}
        {c.step === SETUP_STEP.READY && c.organization && (
          <ReadyStep
            organization={c.organization}
            hasEmail={c.hasEmail}
            onChangeModel={() => {
              c.goTo(SETUP_STEP.MODEL)
            }}
          />
        )}
      </div>
    </>
  )
}
