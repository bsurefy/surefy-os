// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { authClient } from '@/core/auth/authClient'
import { useForm } from '@surefy/web-core/forms'

import { INVALID_TOKEN_CODE } from '../Auth.constants'
import { useAuthErrorText, useFieldErrorText } from '../Auth.hooks'
import { resetPasswordSchema } from './ResetPassword.schema'

import type { ResetPasswordValues } from './ResetPassword.schema'
import type { ResetPasswordProps } from './ResetPassword.types'
import type { BaseSyntheticEvent } from 'react'

/** The new password with its strength meter; an expired link offers a new one. */
export function useResetPasswordController({ token, hasLinkError = false }: ResetPasswordProps) {
  const t = useTranslations('auth.resetPassword')
  const authErrorText = useAuthErrorText()
  const fieldErrorText = useFieldErrorText()
  const [isExpired, setIsExpired] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const form = useForm({
    schema: resetPasswordSchema,
    defaultValues: { password: '', confirmPassword: '' } satisfies ResetPasswordValues,
  })

  const submit = form.handleSubmit(async (values) => {
    if (token === undefined) return
    const { error } = await authClient.resetPassword({ newPassword: values.password, token })
    if (error) {
      if (error.code === INVALID_TOKEN_CODE) setIsExpired(true)
      else form.setError('root', { message: authErrorText(error) })
      return
    }
    setIsDone(true)
  })

  const onSubmit = (event: BaseSyntheticEvent) => {
    void submit(event)
  }

  const { errors } = form.formState
  return {
    register: form.register,
    password: form.watch('password'),
    passwordError: fieldErrorText(errors.password?.message),
    confirmError: fieldErrorText(errors.confirmPassword?.message),
    formError: errors.root?.message,
    isPending: form.formState.isSubmitting,
    isExpired: hasLinkError || token === undefined || isExpired,
    isDone,
    onSubmit,
    t,
  }
}
