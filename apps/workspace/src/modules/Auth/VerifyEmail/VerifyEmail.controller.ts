// SPDX-License-Identifier: AGPL-3.0-only
import { useTranslations } from 'next-intl'
import { useState, useSyncExternalStore } from 'react'

import { ROUTES } from '@/constants/routes'
import { authClient } from '@/core/auth/authClient'

import { RESEND_COOLDOWN_SECONDS } from '../Auth.constants'
import { useAuthErrorText, useCooldown } from '../Auth.hooks'
import { clearPendingEmail, readPendingEmail } from '../Auth.utils'

import type { VerifyEmailProps } from './VerifyEmail.types'

/** The pending address never changes while the screen is open. */
const subscribeToNothing = () => () => {
  // nothing to unsubscribe from
}

/** "Check your email": the pending address, Resend with its cooldown, and the way to start over. */
export function useVerifyEmailController({ hasLinkError = false }: VerifyEmailProps) {
  const t = useTranslations('auth.verifyEmail')
  const authErrorText = useAuthErrorText()
  // sessionStorage exists only in the browser: the server render and hydration see no address
  const email = useSyncExternalStore(subscribeToNothing, readPendingEmail, () => null)
  const [isSending, setIsSending] = useState(false)
  const [isResent, setIsResent] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const cooldown = useCooldown(RESEND_COOLDOWN_SECONDS)

  const onResend = async () => {
    if (email === null || cooldown.secondsLeft > 0) return
    setIsSending(true)
    setErrorMessage(null)
    const { error } = await authClient.sendVerificationEmail({
      email,
      callbackURL: ROUTES.auth.organizations,
    })
    setIsSending(false)
    if (error) {
      setErrorMessage(authErrorText(error))
      return
    }
    setIsResent(true)
    cooldown.start()
  }

  return {
    email,
    hasLinkError,
    isSending,
    isResent,
    errorMessage,
    secondsLeft: cooldown.secondsLeft,
    onResend: () => {
      void onResend()
    },
    onUseDifferentEmail: clearPendingEmail,
    t,
  }
}
