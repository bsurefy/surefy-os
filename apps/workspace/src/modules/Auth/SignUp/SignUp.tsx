// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import Link from 'next/link'

import { ROUTES } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import { Banner, Spinner } from '@surefy/ui/components/Feedback'
import { Field } from '@surefy/ui/components/Forms'
import { Button } from '@surefy/ui/primitives/button'
import { Input } from '@surefy/ui/primitives/input'

import AuthCard from '../AuthCard'
import PasswordInput from '../PasswordInput'
import PasswordStrength from '../PasswordStrength'
import { useSignUpController } from './SignUp.controller'

/** Create an account, or "Ask your admin for an invitation" when the install does not allow it. */
export default function SignUp() {
  const {
    register,
    password,
    nameError,
    emailError,
    passwordError,
    formError,
    isPending,
    isLoadingOptions,
    isSignupOpen,
    isEmailPasswordOn,
    onSubmit,
    t,
  } = useSignUpController()

  if (isLoadingOptions) {
    return (
      <AuthCard title={t('title')}>
        <Spinner />
      </AuthCard>
    )
  }

  if (!isSignupOpen || !isEmailPasswordOn) {
    return (
      <AuthCard
        title={t('closed.title')}
        description={t('closed.description')}
        footer={
          <p>
            {t.rich('haveAccount', {
              link: (chunks) => (
                <Link
                  href={toRoute(ROUTES.auth.login)}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {chunks}
                </Link>
              ),
            })}
          </p>
        }
      />
    )
  }

  return (
    <AuthCard
      title={t('title')}
      description={t('description')}
      footer={
        <p>
          {t.rich('haveAccount', {
            link: (chunks) => (
              <Link
                href={toRoute(ROUTES.auth.login)}
                className="text-primary underline-offset-4 hover:underline"
              >
                {chunks}
              </Link>
            ),
          })}
        </p>
      }
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        {formError && <Banner tone="destructive" title={formError} isAnnounced />}
        <Field label={t('name')} error={nameError}>
          <Input autoComplete="name" autoFocus {...register('name')} />
        </Field>
        <Field label={t('email')} error={emailError}>
          <Input type="email" autoComplete="email" {...register('email')} />
        </Field>
        <div className="flex flex-col gap-2">
          <Field label={t('password')} description={t('passwordHint')} error={passwordError}>
            <PasswordInput autoComplete="new-password" {...register('password')} />
          </Field>
          <PasswordStrength password={password} />
        </div>
        <Button type="submit" isLoading={isPending}>
          {t('submit')}
        </Button>
      </form>
    </AuthCard>
  )
}
