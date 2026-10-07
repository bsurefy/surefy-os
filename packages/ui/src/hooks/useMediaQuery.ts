// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useSyncExternalStore } from 'react'

/** Whether a media query matches; false during server rendering. */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const list = globalThis.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => {
        list.removeEventListener('change', onChange)
      }
    },
    () => globalThis.matchMedia(query).matches,
    () => false,
  )
}
