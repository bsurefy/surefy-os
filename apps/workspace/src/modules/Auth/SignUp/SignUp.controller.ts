// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { authQueries } from '@/api/auth'
import { ROUTES } from '@/constants/routes'
import { authClient } from '@/core/auth/authClient'
import { toRoute } from '@/modules/Workspace'
import { useForm } from '@surefy/web-core/forms'

import { useAuthErrorText, useFieldErrorText } from '../Auth.hooks'
import { savePendingEmail } from '../Auth.utils'
import { signUpSchema } from './SignUp.schema'

import type { SignUpValues } from './SignUp.schema'
import type { BaseSyntheticEvent } from 'react'

/**
 * Name, email and password; the verification link signs the person in and opens the organization
 * picker, which sends them on (to "No organization" when they belong to none).
 */
export function useSignUpController() {
  const t = useTranslations('auth.signUp')
  const router = useRouter()
  const authErrorText = useAuthErrorText()
  const fieldErrorText = useFieldErrorText()
  const { data: options, isPending: isLoadingOptions } = useQuery(authQueries.options())
  const form = useForm({
    schema: signUpSchema,
    defaultValues: { name: '', email: '', password: '' } satisfies SignUpValues,
  })

  const submit = form.handleSubmit(async (values) => {
    const { error } = await authClient.signUp.email({
      ...values,
      callbackURL: ROUTES.auth.organizations,
    })
    if (error) {
      form.setError('root', { message: authErrorText(error) })
      return
    }
    savePendingEmail(values.email)
    router.push(toRoute(ROUTES.auth.verifyEmail))
  })

  const onSubmit = (event: BaseSyntheticEvent) => {
    void submit(event)
  }

  const { errors } = form.formState
  return {
    register: form.register,
    password: form.watch('password'),
    nameError: fieldErrorText(errors.name?.message),
    emailError: fieldErrorText(errors.email?.message),
    passwordError: fieldErrorText(errors.password?.message),
    formError: errors.root?.message,
    isPending: form.formState.isSubmitting,
    isLoadingOptions,
    isSignupOpen: options?.signupOpen ?? false,
    isEmailPasswordOn: options?.emailPassword ?? true,
    onSubmit,
    t,
  }
}
