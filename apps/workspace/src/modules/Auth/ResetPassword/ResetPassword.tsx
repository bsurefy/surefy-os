// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import Link from 'next/link'

import { ROUTES } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import { Banner } from '@surefy/ui/components/Feedback'
import { Field } from '@surefy/ui/components/Forms'
import { Button } from '@surefy/ui/primitives/button'

import AuthCard from '../AuthCard'
import PasswordInput from '../PasswordInput'
import PasswordStrength from '../PasswordStrength'
import { useResetPasswordController } from './ResetPassword.controller'

import type { ResetPasswordProps } from './ResetPassword.types'

/** Choose a new password; "This link has expired · Send a new one" for a dead link. */
export default function ResetPassword(props: Readonly<ResetPasswordProps>) {
  const {
    register,
    password,
    passwordError,
    confirmError,
    formError,
    isPending,
    isExpired,
    isDone,
    onSubmit,
    t,
  } = useResetPasswordController(props)

  if (isDone) {
    return (
      <AuthCard title={t('done.title')} description={t('done.description')}>
        <Button asChild>
          <Link href={toRoute(ROUTES.auth.login)}>{t('done.signIn')}</Link>
        </Button>
      </AuthCard>
    )
  }

  if (isExpired) {
    return (
      <AuthCard title={t('expired.title')} description={t('expired.description')}>
        <Button asChild>
          <Link href={toRoute(ROUTES.auth.forgotPassword)}>{t('expired.sendNew')}</Link>
        </Button>
      </AuthCard>
    )
  }

  return (
    <AuthCard title={t('title')} description={t('description')}>
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        {formError && <Banner tone="destructive" title={formError} isAnnounced />}
        <div className="flex flex-col gap-2">
          <Field label={t('password')} description={t('passwordHint')} error={passwordError}>
            <PasswordInput autoComplete="new-password" autoFocus {...register('password')} />
          </Field>
          <PasswordStrength password={password} />
        </div>
        <Field label={t('confirmPassword')} error={confirmError}>
          <PasswordInput autoComplete="new-password" {...register('confirmPassword')} />
        </Field>
        <Button type="submit" isLoading={isPending}>
          {t('submit')}
        </Button>
      </form>
    </AuthCard>
  )
}
