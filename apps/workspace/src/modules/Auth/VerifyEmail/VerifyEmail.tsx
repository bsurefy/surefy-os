// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import Link from 'next/link'

import { ROUTES } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import { Banner } from '@surefy/ui/components/Feedback'
import { Button } from '@surefy/ui/primitives/button'

import AuthCard from '../AuthCard'
import { useVerifyEmailController } from './VerifyEmail.controller'

import type { VerifyEmailProps } from './VerifyEmail.types'

/** "Check your email" with Resend (cooldown shown) and "Use a different email". */
export default function VerifyEmail(props: Readonly<VerifyEmailProps>) {
  const {
    email,
    hasLinkError,
    isSending,
    isResent,
    errorMessage,
    secondsLeft,
    onResend,
    onUseDifferentEmail,
    t,
  } = useVerifyEmailController(props)

  return (
    <AuthCard
      title={t('title')}
      description={email === null ? t('descriptionNoEmail') : t('description', { email })}
      footer={
        <Link
          href={toRoute(ROUTES.auth.signup)}
          onClick={onUseDifferentEmail}
          className="text-primary underline-offset-4 hover:underline"
        >
          {t('differentEmail')}
        </Link>
      }
    >
      {hasLinkError && (
        <Banner
          tone="warning"
          title={t('linkError.title')}
          description={t('linkError.description')}
          isAnnounced
        />
      )}
      {errorMessage && <Banner tone="destructive" title={errorMessage} isAnnounced />}
      {isResent && secondsLeft > 0 && <Banner tone="success" title={t('resent')} isAnnounced />}
      {email !== null && (
        <Button
          variant="secondary"
          onClick={onResend}
          isLoading={isSending}
          aria-disabled={secondsLeft > 0}
        >
          {secondsLeft > 0 ? t('resendIn', { seconds: secondsLeft }) : t('resend')}
        </Button>
      )}
      <Button asChild variant="ghost">
        <Link href={toRoute(ROUTES.auth.login)}>{t('backToSignIn')}</Link>
      </Button>
    </AuthCard>
  )
}
