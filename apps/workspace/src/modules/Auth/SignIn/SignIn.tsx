// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import Link from 'next/link'

import { ROUTES } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import { Banner } from '@surefy/ui/components/Feedback'
import { Field } from '@surefy/ui/components/Forms'
import { Button } from '@surefy/ui/primitives/button'
import { Input } from '@surefy/ui/primitives/input'
import { Separator } from '@surefy/ui/primitives/separator'

import { OAUTH_PROVIDER_LABEL_KEYS } from '../Auth.constants'
import AuthCard from '../AuthCard'
import PasswordInput from '../PasswordInput'
import { useSignInController } from './SignIn.controller'

import type { SignInProps } from './SignIn.types'

/** Sign in, with the locked state. */
export default function SignIn(props: Readonly<SignInProps>) {
  const {
    register,
    emailError,
    passwordError,
    formError,
    isPending,
    isEmailPasswordOn,
    oauthProviders,
    isSignupOpen,
    lockedUntilText,
    onSubmit,
    onProvider,
    onTryAgain,
    t,
  } = useSignInController(props)

  if (lockedUntilText !== null) {
    return (
      <AuthCard
        title={t('locked.title')}
        description={t('locked.description', { time: lockedUntilText })}
      >
        <div className="flex flex-col gap-2">
          <Button asChild>
            <Link href={toRoute(ROUTES.auth.forgotPassword)}>{t('locked.reset')}</Link>
          </Button>
          <Button variant="ghost" onClick={onTryAgain}>
            {t('locked.back')}
          </Button>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title={t('title')}
      description={t('description')}
      footer={
        isSignupOpen ? (
          <p>
            {t('noAccount')}{' '}
            <Link
              href={toRoute(ROUTES.auth.signup)}
              className="text-primary underline-offset-4 hover:underline"
            >
              {t('signUp')}
            </Link>
          </p>
        ) : undefined
      }
    >
      {oauthProviders.length > 0 && (
        <div className="flex flex-col gap-2">
          {oauthProviders.map((provider) => (
            <Button
              key={provider}
              variant="secondary"
              onClick={() => {
                onProvider(provider)
              }}
            >
              {t(`providers.${OAUTH_PROVIDER_LABEL_KEYS[provider]}`)}
            </Button>
          ))}
          {isEmailPasswordOn && <Separator className="my-2" />}
        </div>
      )}
      {isEmailPasswordOn && (
        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
          {formError && <Banner tone="destructive" title={formError} isAnnounced />}
          <Field label={t('email')} error={emailError}>
            <Input type="email" autoComplete="username" autoFocus {...register('email')} />
          </Field>
          <Field label={t('password')} error={passwordError}>
            <PasswordInput autoComplete="current-password" {...register('password')} />
          </Field>
          <Link
            href={toRoute(ROUTES.auth.forgotPassword)}
            className="text-body text-primary self-start underline-offset-4 hover:underline"
          >
            {t('forgot')}
          </Link>
          <Button type="submit" isLoading={isPending}>
            {t('submit')}
          </Button>
        </form>
      )}
    </AuthCard>
  )
}
