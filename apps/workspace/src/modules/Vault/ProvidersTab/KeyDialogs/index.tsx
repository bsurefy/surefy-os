// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { KEY_DIALOG } from '../ProvidersTab.constants'
import RevokeKeyDialog from './RevokeKeyDialog'
import SwitchTrafficDialog from './SwitchTrafficDialog'

import type { OpenKeyDialog } from '../ProvidersTab.controller'

/** The confirmations of the keys table: revoke and switch traffic. */
export default function KeyDialogsHost({
  orgId,
  dialog,
  onClose,
}: Readonly<{ orgId: string; dialog: OpenKeyDialog | null; onClose: () => void }>) {
  if (!dialog?.credential) return null
  if (dialog.kind === KEY_DIALOG.REVOKE) {
    return <RevokeKeyDialog orgId={orgId} credential={dialog.credential} onClose={onClose} />
  }
  if (dialog.kind === KEY_DIALOG.SWITCH) {
    return <SwitchTrafficDialog orgId={orgId} credential={dialog.credential} onClose={onClose} />
  }
  return null
}
