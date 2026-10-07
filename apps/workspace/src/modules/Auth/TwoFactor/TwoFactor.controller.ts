// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { authClient } from '@/core/auth/authClient'
import { toRoute } from '@/modules/Workspace'
import { meQueries } from '@surefy/web-core/api/me'
import { useForm } from '@surefy/web-core/forms'

import { TWO_FACTOR_COOKIE_CODE } from '../Auth.constants'
import { useAuthErrorText, useFieldErrorText } from '../Auth.hooks'
import { getPostSignInPath } from '../Auth.utils'
import { TWO_FACTOR_MODE } from './TwoFactor.constants'
import { recoveryCodeSchema } from './TwoFactor.schema'

import type { TwoFactorMode } from './TwoFactor.constants'
import type { BaseSyntheticEvent } from 'react'

/** The authenticator code, or a recovery code, after a correct password. */
export function useTwoFactorController() {
  const t = useTranslations('auth.twoFactor')
  const router = useRouter()
  const queryClient = useQueryClient()
  const authErrorText = useAuthErrorText()
  const fieldErrorText = useFieldErrorText()
  const [mode, setMode] = useState<TwoFactorMode>(TWO_FACTOR_MODE.CODE)
  const [code, setCode] = useState('')
  const [isPending, setIsPending] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isTimedOut, setIsTimedOut] = useState(false)
  const form = useForm({ schema: recoveryCodeSchema, defaultValues: { code: '' } })

  const finish = async (result: { error: { code?: string; status: number } | null }) => {
    if (result.error) {
      if (result.error.code === TWO_FACTOR_COOKIE_CODE) setIsTimedOut(true)
      else setErrorMessage(authErrorText(result.error))
      setIsPending(false)
      return
    }
    const me = await queryClient.query(meQueries.current())
    router.replace(toRoute(getPostSignInPath(me)))
  }

  const verifyCode = async (value: string) => {
    setIsPending(true)
    setErrorMessage(null)
    await finish(await authClient.twoFactor.verifyTotp({ code: value }))
    setCode('')
  }

  const submitRecovery = form.handleSubmit(async (values) => {
    setIsPending(true)
    setErrorMessage(null)
    await finish(await authClient.twoFactor.verifyBackupCode({ code: values.code }))
  })

  return {
    mode,
    code,
    isPending,
    isTimedOut,
    errorMessage,
    register: form.register,
    recoveryError: fieldErrorText(form.formState.errors.code?.message),
    onCodeChange: setCode,
    onCodeComplete: (value: string) => {
      void verifyCode(value)
    },
    onSubmitRecovery: (event: BaseSyntheticEvent) => {
      void submitRecovery(event)
    },
    onToggleMode: () => {
      setErrorMessage(null)
      setMode((current) =>
        current === TWO_FACTOR_MODE.CODE ? TWO_FACTOR_MODE.RECOVERY : TWO_FACTOR_MODE.CODE,
      )
    },
    t,
  }
}
