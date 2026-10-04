// SPDX-License-Identifier: AGPL-3.0-only
import { useSyncExternalStore } from 'react'

type Listener = () => void

let isOpen = false
const listeners = new Set<Listener>()

function setOpen(next: boolean) {
  if (isOpen === next) return
  isOpen = next
  for (const listener of listeners) listener()
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => isOpen
// the dialog never renders open on the server
const getServerSnapshot = () => false

/** Opens the session-expired dialog: the app's `onUnauthenticated` handler. Calling it twice is harmless. */
export function openSessionExpired(): void {
  setOpen(true)
}

export function closeSessionExpired(): void {
  setOpen(false)
}

/** Whether the session-expired dialog is open. */
export function useIsSessionExpired(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
