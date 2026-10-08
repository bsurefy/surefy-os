// SPDX-License-Identifier: AGPL-3.0-only
import { useSyncExternalStore } from 'react'

import type { SessionDialogMode } from './SessionExpiredDialog.types'

type Listener = () => void

let mode: SessionDialogMode | null = null
const listeners = new Set<Listener>()

function setMode(next: SessionDialogMode | null) {
  if (mode === next) return
  mode = next
  for (const listener of listeners) listener()
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => mode
// the dialog never renders open on the server
const getServerSnapshot = () => null

/** Opens the session-expired dialog: the app's `onUnauthenticated` handler. Calling it twice is harmless. */
export function openSessionExpired(): void {
  setMode('expired')
}

/**
 * Opens the "Confirm it's you" dialog: the app's `onSessionNotFresh` handler, for
 * `AUTH_SESSION_NOT_FRESH`. An open session-expired dialog stays, because it asks for the same
 * sign-in and cannot be cancelled.
 */
export function openConfirmIdentity(): void {
  if (mode === null) setMode('confirm')
}

export function closeSessionExpired(): void {
  setMode(null)
}

/** Which of the two dialogs is open, or null. */
export function useSessionDialogMode(): SessionDialogMode | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
