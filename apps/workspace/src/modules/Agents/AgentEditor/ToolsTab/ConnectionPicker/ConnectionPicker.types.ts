// SPDX-License-Identifier: AGPL-3.0-only
import type { ConnectionDto } from '@surefy/contracts'

import type { BuildableToolKind } from '../ToolsTab.types'

export interface ConnectionPickerProps {
  /** Set by `Field`. */
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  /** The kind of tool: decides the app the Add connection dialog starts with. */
  kind: BuildableToolKind
  /** The accounts the person may use for this kind of tool. */
  connections: readonly ConnectionDto[]
  /** The picked connection; null for none. */
  value: string | null
  onValueChange: (connectionId: string | null) => void
  isLoading: boolean
  /** What "no connection" is called ("No sign-in"); none when the tool needs a connection. */
  noneLabel?: string
}
