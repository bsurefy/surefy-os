// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { authClient } from '@/core/auth/authClient'
import { toRoute } from '@/modules/Workspace'
import { meKeys, meQueries } from '@surefy/web-core/api/me'
import { useForm } from '@surefy/web-core/forms'

import { useAuthErrorText, useFieldErrorText } from '../Auth.hooks'
import { getRedirectTarget } from '../Auth.redirect'
import { getPostSignInPath, getTotpSecret } from '../Auth.utils'
import { RECOVERY_CODES_FILE_NAME, TWO_FACTOR_SETUP_STEP } from './TwoFactorSetup.constants'
import { confirmPasswordSchema } from './TwoFactorSetup.schema'

import type { TwoFactorSetupStep } from './TwoFactorSetup.constants'
import type { TwoFactorSetupProps } from './TwoFactorSetup.types'
import type { BaseSyntheticEvent } from 'react'

/** Password, authenticator (secret and first code), then the recovery codes, shown once. */
export function useTwoFactorSetupController({ redirect }: TwoFactorSetupProps) {
  const redirectTo = getRedirectTarget(redirect)
  const t = useTranslations('auth.twoFactorSetup')
  const router = useRouter()
  const queryClient = useQueryClient()
  const authErrorText = useAuthErrorText()
  const fieldErrorText = useFieldErrorText()
  const [step, setStep] = useState<TwoFactorSetupStep>(TWO_FACTOR_SETUP_STEP.PASSWORD)
  const [totpUri, setTotpUri] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [code, setCode] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)
  const [codeError, setCodeError] = useState<string | null>(null)
  const [hasSavedCodes, setHasSavedCodes] = useState(false)
  const form = useForm({ schema: confirmPasswordSchema, defaultValues: { password: '' } })

  const submitPassword = form.handleSubmit(async (values) => {
    const { data, error } = await authClient.twoFactor.enable({ password: values.password })
    if (error) {
      form.setError('root', { message: authErrorText(error) })
      return
    }
    if (!('totpURI' in data)) return // the authenticator method always answers with its URI
    setTotpUri(data.totpURI)
    setRecoveryCodes(data.backupCodes)
    setStep(TWO_FACTOR_SETUP_STEP.SCAN)
  })

  const verifyCode = async (value: string) => {
    setIsVerifying(true)
    setCodeError(null)
    const { error } = await authClient.twoFactor.verifyTotp({ code: value })
    setIsVerifying(false)
    if (error) {
      setCodeError(authErrorText(error))
      setCode('')
      return
    }
    await queryClient.invalidateQueries({ queryKey: meKeys.all() })
    setStep(TWO_FACTOR_SETUP_STEP.RECOVERY_CODES)
  }

  const onDownload = () => {
    const url = URL.createObjectURL(new Blob([recoveryCodes.join('\n')], { type: 'text/plain' }))
    const link = document.createElement('a')
    link.href = url
    link.download = RECOVERY_CODES_FILE_NAME
    link.click()
    URL.revokeObjectURL(url)
  }

  const onDone = async () => {
    const path = redirectTo ?? getPostSignInPath(await queryClient.query(meQueries.current()))
    router.replace(toRoute(path))
  }

  return {
    step,
    register: form.register,
    passwordError: fieldErrorText(form.formState.errors.password?.message),
    formError: form.formState.errors.root?.message,
    isPending: form.formState.isSubmitting,
    onSubmitPassword: (event: BaseSyntheticEvent) => {
      void submitPassword(event)
    },
    totpUri,
    secret: getTotpSecret(totpUri),
    code,
    codeError,
    isVerifying,
    onCodeChange: setCode,
    onCodeComplete: (value: string) => {
      void verifyCode(value)
    },
    recoveryCodes,
    hasSavedCodes,
    onHasSavedCodesChange: setHasSavedCodes,
    onDownload,
    onCopy: () => navigator.clipboard.writeText(recoveryCodes.join('\n')),
    onDone: () => {
      if (hasSavedCodes) void onDone()
    },
    t,
  }
}
