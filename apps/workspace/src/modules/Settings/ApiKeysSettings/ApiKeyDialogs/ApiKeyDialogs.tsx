// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { API_KEY_DIALOG } from '../ApiKeysSettings.constants'
import CreateApiKeyDialog from './CreateApiKeyDialog'
import RenameApiKeyDialog from './RenameApiKeyDialog'
import RevokeApiKeyDialog from './RevokeApiKeyDialog'

import type { OpenDialog } from '../ApiKeysSettings.controller'

export interface ApiKeyDialogsProps {
  orgId: string
  dialog: OpenDialog | null
  /** Whether another active key exists, so Revoke can suggest rotating. */
  hasOtherActiveKeys: boolean
  onClose: () => void
}

/** The dialog that is open, if any: create, rename or revoke. */
export default function ApiKeyDialogs({
  orgId,
  dialog,
  hasOtherActiveKeys,
  onClose,
}: Readonly<ApiKeyDialogsProps>) {
  if (!dialog) return null
  const { apiKey } = dialog
  switch (dialog.kind) {
    case API_KEY_DIALOG.CREATE:
      return <CreateApiKeyDialog orgId={orgId} onClose={onClose} />
    case API_KEY_DIALOG.RENAME:
      return apiKey ? <RenameApiKeyDialog orgId={orgId} apiKey={apiKey} onClose={onClose} /> : null
    case API_KEY_DIALOG.REVOKE:
      return apiKey ? (
        <RevokeApiKeyDialog
          orgId={orgId}
          apiKey={apiKey}
          hasOtherActiveKeys={hasOtherActiveKeys}
          onClose={onClose}
        />
      ) : null
  }
}
