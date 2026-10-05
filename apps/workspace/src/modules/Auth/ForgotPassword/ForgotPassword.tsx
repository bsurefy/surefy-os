// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import Link from 'next/link'

import { ROUTES } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import { Field } from '@surefy/ui/components/Forms'
import { Button } from '@surefy/ui/primitives/button'
import { Input } from '@surefy/ui/primitives/input'

import AuthCard from '../AuthCard'
import { useForgotPasswordController } from './ForgotPassword.controller'

/** Forgot password: email, then the always-the-same "Check your email". */
export default function ForgotPassword() {
  const { register, emailError, isPending, sentTo, secondsLeft, onSubmit, onResend, t } =
    useForgotPasswordController()

  const backLink = (
    <Link
      href={toRoute(ROUTES.auth.login)}
      className="text-primary underline-offset-4 hover:underline"
    >
      {t('backToSignIn')}
    </Link>
  )

  if (sentTo !== null) {
    return (
      <AuthCard
        title={t('sent.title')}
        description={t('sent.description', { email: sentTo })}
        footer={backLink}
      >
        <Button variant="secondary" onClick={onResend} aria-disabled={secondsLeft > 0}>
          {secondsLeft > 0 ? t('sent.resendIn', { seconds: secondsLeft }) : t('sent.resend')}
        </Button>
      </AuthCard>
    )
  }

  return (
    <AuthCard title={t('title')} description={t('description')} footer={backLink}>
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label={t('email')} error={emailError}>
          <Input type="email" autoComplete="email" autoFocus {...register('email')} />
        </Field>
        <Button type="submit" isLoading={isPending}>
          {t('submit')}
        </Button>
      </form>
    </AuthCard>
  )
}
