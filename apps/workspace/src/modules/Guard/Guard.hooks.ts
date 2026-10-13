// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState } from 'react'

/** A value that follows `value` after it stayed the same for `delayMs` (live previews, searches). */
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
