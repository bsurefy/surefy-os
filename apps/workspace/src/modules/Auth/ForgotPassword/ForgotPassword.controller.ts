// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { ROUTES } from '@/constants/routes'
import { authClient } from '@/core/auth/authClient'
import { useForm } from '@surefy/web-core/forms'

import { RESEND_COOLDOWN_SECONDS } from '../Auth.constants'
import { useCooldown, useFieldErrorText } from '../Auth.hooks'
import { forgotPasswordSchema } from './ForgotPassword.schema'

import type { ForgotPasswordValues } from './ForgotPassword.schema'
import type { BaseSyntheticEvent } from 'react'

/**
 * Email, then "Check your email". The screen says the same whether or not the address has an
 * account, so it cannot be used to find out who has one: a failed request is not reported either.
 */
export function useForgotPasswordController() {
  const t = useTranslations('auth.forgotPassword')
  const fieldErrorText = useFieldErrorText()
  const [sentTo, setSentTo] = useState<string | null>(null)
  const cooldown = useCooldown(RESEND_COOLDOWN_SECONDS)
  const form = useForm({
    schema: forgotPasswordSchema,
    defaultValues: { email: '' } satisfies ForgotPasswordValues,
  })

  const send = async (email: string) => {
    await authClient.requestPasswordReset({ email, redirectTo: ROUTES.auth.resetPassword })
    setSentTo(email)
    cooldown.start()
  }

  const submit = form.handleSubmit((values) => send(values.email))
  const onSubmit = (event: BaseSyntheticEvent) => {
    void submit(event)
  }

  return {
    register: form.register,
    emailError: fieldErrorText(form.formState.errors.email?.message),
    isPending: form.formState.isSubmitting,
    sentTo,
    secondsLeft: cooldown.secondsLeft,
    onSubmit,
    onResend: () => {
      if (sentTo !== null && cooldown.secondsLeft === 0) void send(sentTo)
    },
    t,
  }
}
