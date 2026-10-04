// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useFormatter, useTranslations } from 'next-intl'
import { useState } from 'react'

import { authQueries } from '@/api/auth'
import { ROUTES } from '@/constants/routes'
import { authClient } from '@/core/auth/authClient'
import { toRoute } from '@/modules/Workspace'
import type { OauthProvider } from '@surefy/contracts'
import { meQueries } from '@surefy/web-core/api/me'
import { useForm } from '@surefy/web-core/forms'

import { EMAIL_NOT_VERIFIED_CODE } from '../Auth.constants'
import { useAuthErrorText, useFieldErrorText } from '../Auth.hooks'
import { getRedirectTarget } from '../Auth.redirect'
import { getPostSignInPath, getRetryAt, savePendingEmail } from '../Auth.utils'
import { signInSchema } from './SignIn.schema'

import type { SignInValues } from './SignIn.schema'
import type { SignInProps } from './SignIn.types'
import type { BaseSyntheticEvent } from 'react'

/** Email and password, the providers the install enables, and the locked state after too many tries. */
export function useSignInController({ redirect }: SignInProps) {
  const redirectTo = getRedirectTarget(redirect)
  const t = useTranslations('auth.signIn')
  const format = useFormatter()
  const router = useRouter()
  const queryClient = useQueryClient()
  const authErrorText = useAuthErrorText()
  const fieldErrorText = useFieldErrorText()
  const { data: options } = useQuery(authQueries.options())
  const [lockedUntil, setLockedUntil] = useState<Date | null>(null)
  const [isRedirecting, setIsRedirecting] = useState(false)
  const form = useForm({
    schema: signInSchema,
    defaultValues: { email: '', password: '' } satisfies SignInValues,
  })

  const continueSignedIn = async () => {
    setIsRedirecting(true)
    const path = redirectTo ?? getPostSignInPath(await queryClient.query(meQueries.current()))
    router.replace(toRoute(path))
  }

  const submit = form.handleSubmit(async (values) => {
    let retryAfter: string | null = null
    const { data, error } = await authClient.signIn.email(values, {
      onError: (context) => {
        retryAfter = context.response.headers.get('x-retry-after')
      },
    })
    if (error) {
      if (error.status === 429) {
        setLockedUntil(getRetryAt(retryAfter))
      } else if (error.code === EMAIL_NOT_VERIFIED_CODE) {
        savePendingEmail(values.email)
        router.push(toRoute(ROUTES.auth.verifyEmail))
      } else {
        form.setError('root', { message: authErrorText(error) })
      }
      return
    }
    // With two-factor on, the client has already sent the browser to the code screen.
    if ('twoFactorRedirect' in data && data.twoFactorRedirect) return
    await continueSignedIn()
  })

  const onSubmit = (event: BaseSyntheticEvent) => {
    void submit(event)
  }

  const onProvider = (provider: OauthProvider) => {
    void authClient.signIn.social({
      provider,
      callbackURL: redirectTo ?? ROUTES.auth.organizations,
      errorCallbackURL: ROUTES.auth.login,
    })
  }

  const { errors } = form.formState
  return {
    register: form.register,
    emailError: fieldErrorText(errors.email?.message),
    passwordError: fieldErrorText(errors.password?.message),
    formError: errors.root?.message,
    isPending: form.formState.isSubmitting || isRedirecting,
    isEmailPasswordOn: options?.emailPassword ?? true,
    oauthProviders: options?.oauthProviders ?? [],
    isSignupOpen: options?.signupOpen ?? false,
    lockedUntilText:
      lockedUntil === null
        ? null
        : format.dateTime(lockedUntil, { hour: '2-digit', minute: '2-digit' }),
    onSubmit,
    onProvider,
    onTryAgain: () => {
      setLockedUntil(null)
    },
    t,
  }
}
