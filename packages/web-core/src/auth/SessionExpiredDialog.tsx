// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@surefy/ui/primitives/alert-dialog'
import { Button } from '@surefy/ui/primitives/button'

import { useSessionExpiredDialogController } from './SessionExpiredDialog.controller'

import type { SessionExpiredDialogProps } from './SessionExpiredDialog.types'

/**
 * Opens over the current page when the session ends during work (`openSessionExpired`, the app's
 * `onUnauthenticated` handler), so unsaved input is kept. The person signs in again inside it or
 * signs out. It cannot be dismissed: Esc and clicks outside do nothing. In `confirm` mode
 * (`openConfirmIdentity`, for `AUTH_SESSION_NOT_FRESH`) the same sign-in restores a fresh session,
 * and Esc or Cancel closes it without running the action. Mounted once per app.
 */
export function SessionExpiredDialog(props: Readonly<SessionExpiredDialogProps>) {
  const { mode, onSignedIn, onSignOutClick, onCancelClick, t } =
    useSessionExpiredDialogController(props)
  const isOpen = mode !== null

  return (
    <AlertDialog open={isOpen}>
      <AlertDialogContent
        onEscapeKeyDown={(event) => {
          event.preventDefault()
          if (mode === 'confirm') onCancelClick()
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{t('title')}</AlertDialogTitle>
          <AlertDialogDescription>{t('description')}</AlertDialogDescription>
        </AlertDialogHeader>
        {mode !== null && (
          <AlertDialogBody>{props.renderSignIn({ mode, onSignedIn })}</AlertDialogBody>
        )}
        <AlertDialogFooter>
          {mode === 'confirm' ? (
            <Button variant="secondary" onClick={onCancelClick}>
              {t('cancel')}
            </Button>
          ) : (
            <Button variant="secondary" onClick={onSignOutClick}>
              {t('signOut')}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
