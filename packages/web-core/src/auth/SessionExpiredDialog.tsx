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
 * signs out. It cannot be dismissed: Esc and clicks outside do nothing. Mounted once per app.
 */
export function SessionExpiredDialog(props: Readonly<SessionExpiredDialogProps>) {
  const { isOpen, onSignedIn, onSignOutClick, t } = useSessionExpiredDialogController(props)

  return (
    <AlertDialog open={isOpen}>
      <AlertDialogContent
        onEscapeKeyDown={(event) => {
          event.preventDefault()
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{t('title')}</AlertDialogTitle>
          <AlertDialogDescription>{t('description')}</AlertDialogDescription>
        </AlertDialogHeader>
        {isOpen && <AlertDialogBody>{props.renderSignIn({ onSignedIn })}</AlertDialogBody>}
        <AlertDialogFooter>
          <Button variant="secondary" onClick={onSignOutClick}>
            {t('signOut')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
