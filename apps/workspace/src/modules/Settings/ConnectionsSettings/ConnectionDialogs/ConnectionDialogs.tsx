// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { CONNECTION_DIALOG } from '../ConnectionsSettings.constants'
import AddConnectionDialog from './AddConnectionDialog'
import DisconnectConnectionDialog from './DisconnectConnectionDialog'
import ReconnectDialog from './ReconnectDialog'
import RenameConnectionDialog from './RenameConnectionDialog'
import UsedByDialog from './UsedByDialog'

import type { OpenDialog } from '../ConnectionsSettings.controller'

export interface ConnectionDialogsProps {
  orgId: string
  dialog: OpenDialog | null
  canManage: boolean
  providerName: (providerKey: string) => string
  onClose: () => void
}

/** The dialog that is open, if any: add, reconnect, rename, disconnect or used by. */
export default function ConnectionDialogs({
  orgId,
  dialog,
  canManage,
  providerName,
  onClose,
}: Readonly<ConnectionDialogsProps>) {
  if (!dialog) return null
  const { connection } = dialog
  switch (dialog.kind) {
    case CONNECTION_DIALOG.ADD:
      return (
        <AddConnectionDialog
          orgId={orgId}
          canManage={canManage}
          providerName={providerName}
          onClose={onClose}
        />
      )
    case CONNECTION_DIALOG.RECONNECT:
      return connection ? (
        <ReconnectDialog
          orgId={orgId}
          connection={connection}
          providerName={providerName(connection.providerKey)}
          onClose={onClose}
        />
      ) : null
    case CONNECTION_DIALOG.RENAME:
      return connection ? (
        <RenameConnectionDialog orgId={orgId} connection={connection} onClose={onClose} />
      ) : null
    case CONNECTION_DIALOG.DISCONNECT:
      return connection ? (
        <DisconnectConnectionDialog orgId={orgId} connection={connection} onClose={onClose} />
      ) : null
    case CONNECTION_DIALOG.USED_BY:
      return connection ? (
        <UsedByDialog orgId={orgId} connection={connection} onClose={onClose} />
      ) : null
  }
}
