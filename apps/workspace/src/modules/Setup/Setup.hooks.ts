// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useEffect, useState, useSyncExternalStore } from 'react'

import { vaultQueries } from '@/api/vault'

import { CONNECTED_MODELS_LIMIT } from './Setup.constants'

/** The value, once it has stopped changing for `delayMs`. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value)
    }, delayMs)
    return () => {
      clearTimeout(timer)
    }
  }, [value, delayMs])

  return debounced
}

function subscribeToNothing(): () => void {
  return () => {
    return
  }
}

/** The address this page is served from ("ai.example.com"), empty while rendering on the server. */
export function useHost(): string {
  return useSyncExternalStore(
    subscribeToNothing,
    () => window.location.host,
    () => '',
  )
}

/** The browser's time zone, for the organization's default; undefined when it cannot tell. */
export function getBrowserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return undefined
  }
}

/** The text of a form field's error: built-in rules arrive translated, custom keys are looked up. */
export function useFieldErrorText() {
  const tValidation = useTranslations('validation')
  return (message?: string) => {
    if (message === undefined) return
    return /^(custom|issues)\./.test(message) ? tValidation(message) : message
  }
}

/** The organization's active keys and servers, which the model step adds to and the summary counts. */
export function useConnectedModels(orgId: string) {
  const credentials = useInfiniteQuery(
    vaultQueries.credentials(orgId, { status: 'active', limit: CONNECTED_MODELS_LIMIT }),
  )
  const connected = credentials.data?.pages.flatMap((page) => page.items) ?? []
  return {
    connected,
    modelCount: connected.reduce((total, credential) => total + (credential.modelCount ?? 0), 0),
    isConnected: connected.length > 0,
    isLoading: credentials.isPending,
  }
}
