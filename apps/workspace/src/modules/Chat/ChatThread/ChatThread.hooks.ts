// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { STICK_TO_BOTTOM_PX } from './ChatThread.constants'

function subscribeToConnection(onChange: () => void): () => void {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

/** Whether the browser has a connection: the composer keeps its draft and send waits ("Offline"). */
export function useIsOnline(): boolean {
  return useSyncExternalStore(
    subscribeToConnection,
    () => navigator.onLine,
    () => true,
  )
}

const scrollToEnd = (element: HTMLElement, behavior: ScrollBehavior) => {
  // jsdom has no layout, so nothing scrolls there
  if (typeof element.scrollIntoView === 'function')
    element.scrollIntoView({ block: 'end', behavior })
}

/**
 * Keeps the newest text in view while an answer streams, but only for a reader who is already at
 * the bottom; one who scrolled up is left alone and gets a way back down.
 */
export function useFollowOutput(changeKey: unknown) {
  const [end, setEnd] = useState<HTMLDivElement | null>(null)
  const isNearBottom = useRef(true)
  const [isAway, setIsAway] = useState(false)

  useEffect(() => {
    if (!end || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      ([entry]) => {
        isNearBottom.current = entry?.isIntersecting ?? true
        setIsAway(!isNearBottom.current)
      },
      { rootMargin: `0px 0px ${String(STICK_TO_BOTTOM_PX)}px 0px` },
    )
    observer.observe(end)
    return () => {
      observer.disconnect()
    }
  }, [end])

  useEffect(() => {
    if (end && isNearBottom.current) scrollToEnd(end, 'auto')
  }, [changeKey, end])

  return {
    setEnd,
    isAway,
    onJumpToLatest: () => {
      if (end) scrollToEnd(end, 'smooth')
    },
  }
}

/** Seconds left of a countdown that starts when `isActive` turns on, then calls `onDone` once. */
export function useCountdown(isActive: boolean, seconds: number, onDone: () => void): number {
  const [left, setLeft] = useState(seconds)
  const done = useRef(onDone)

  useEffect(() => {
    done.current = onDone
  })

  useEffect(() => {
    if (!isActive) return
    const timer = setInterval(() => {
      setLeft((value) => {
        if (value <= 1) {
          clearInterval(timer)
          done.current()
          return 0
        }
        return value - 1
      })
    }, 1000)
    return () => {
      clearInterval(timer)
    }
  }, [isActive])

  return left
}
