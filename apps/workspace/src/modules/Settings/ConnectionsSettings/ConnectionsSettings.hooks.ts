// SPDX-License-Identifier: AGPL-3.0-only
import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void) {
  globalThis.addEventListener('online', onChange)
  globalThis.addEventListener('offline', onChange)
  return () => {
    globalThis.removeEventListener('online', onChange)
    globalThis.removeEventListener('offline', onChange)
  }
}

/**
 * Whether the browser has a connection; true during server rendering. Adding, reconnecting and
 * disconnecting need the network; reads stay visible from the cache.
 */
export function useIsOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => globalThis.navigator.onLine,
    () => true,
  )
}
