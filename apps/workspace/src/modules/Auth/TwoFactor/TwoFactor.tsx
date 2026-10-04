// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import Link from 'next/link'

import { ROUTES } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import { Banner } from '@surefy/ui/components/Feedback'
import { Field } from '@surefy/ui/components/Forms'
import { Button } from '@surefy/ui/primitives/button'
import { Input } from '@surefy/ui/primitives/input'

import AuthCard from '../AuthCard'
import TwoFactorCodeInput from '../TwoFactorCodeInput'
import { TWO_FACTOR_MODE } from './TwoFactor.constants'
import { useTwoFactorController } from './TwoFactor.controller'

/** The two-factor code at sign-in, with "Use a recovery code". */
export default function TwoFactor() {
  const {
    mode,
    code,
    isPending,
    isTimedOut,
    errorMessage,
    register,
    recoveryError,
    onCodeChange,
    onCodeComplete,
    onSubmitRecovery,
    onToggleMode,
    t,
  } = useTwoFactorController()

  if (isTimedOut) {
    return (
      <AuthCard title={t('timedOut.title')} description={t('timedOut.description')}>
        <Button asChild>
          <Link href={toRoute(ROUTES.auth.login)}>{t('timedOut.signIn')}</Link>
        </Button>
      </AuthCard>
    )
  }

  const isRecovery = mode === TWO_FACTOR_MODE.RECOVERY
  return (
    <AuthCard
      title={t('title')}
      description={isRecovery ? t('recovery.description') : t('description')}
      footer={
        <Button variant="link" className="self-start" onClick={onToggleMode}>
          {isRecovery ? t('useCode') : t('useRecovery')}
        </Button>
      }
    >
      {errorMessage && <Banner tone="destructive" title={errorMessage} isAnnounced />}
      {isRecovery ? (
        <form noValidate onSubmit={onSubmitRecovery} className="flex flex-col gap-4">
          <Field label={t('recovery.label')} error={recoveryError}>
            <Input autoComplete="off" spellCheck={false} autoFocus {...register('code')} />
          </Field>
          <Button type="submit" isLoading={isPending}>
            {t('recovery.submit')}
          </Button>
        </form>
      ) : (
        <TwoFactorCodeInput
          value={code}
          onChange={onCodeChange}
          onComplete={onCodeComplete}
          isDisabled={isPending}
        />
      )}
    </AuthCard>
  )
}
