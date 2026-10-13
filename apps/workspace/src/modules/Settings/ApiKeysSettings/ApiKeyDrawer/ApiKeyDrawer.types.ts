// SPDX-License-Identifier: AGPL-3.0-only
import type { ApiKeyDto } from '@surefy/contracts'

export interface ApiKeyDrawerProps {
  orgId: string
  apiKey: ApiKeyDto
  /** Admins and Owners may rename and revoke. */
  canManage: boolean
  onClose: () => void
  onRename: () => void
  onRevoke: () => void
  /** An expired key suggests a replacement: opens the create dialog. */
  onCreateReplacement: () => void
}
