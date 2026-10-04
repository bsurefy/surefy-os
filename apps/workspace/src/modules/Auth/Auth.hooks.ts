// SPDX-License-Identifier: AGPL-3.0-only

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { getAuthErrorKey } from './Auth.utils'

import type { AuthClientError } from './Auth.utils'

/** The text of a form field's error: built-in rules arrive translated, custom keys are looked up. */
export function useFieldErrorText() {
  const tValidation = useTranslations('validation')
  return (message?: string) => {
    if (message === undefined) return
    return /^(custom|issues)\./.test(message) ? tValidation(message) : message
  }
}

/** The translated explanation of a Better Auth error. */
export function useAuthErrorText() {
  const t = useTranslations('auth.errors')
  return (error: Pick<AuthClientError, 'code' | 'status'>) => t(getAuthErrorKey(error))
}

/** Seconds left of a cooldown that starts now; `start()` restarts it. */
export function useCooldown(seconds: number) {
  const [secondsLeft, setSecondsLeft] = useState(0)

  useEffect(() => {
    if (secondsLeft <= 0) return
    const timer = setTimeout(() => {
      setSecondsLeft((value) => value - 1)
    }, 1000)
    return () => {
      clearTimeout(timer)
    }
  }, [secondsLeft])

  return {
    secondsLeft,
    start: () => {
      setSecondsLeft(seconds)
    },
  }
}
