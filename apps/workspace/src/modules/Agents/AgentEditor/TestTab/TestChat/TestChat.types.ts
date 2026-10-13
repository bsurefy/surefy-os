// SPDX-License-Identifier: AGPL-3.0-only
import type { TestActivity, TestUiMessage } from '../TestTab.types'

export interface TestChatProps {
  messages: readonly TestUiMessage[]
  starters: readonly string[]
  activity: TestActivity
  isSaving: boolean
  notSaved: boolean
  isReadOnly: boolean
  failureMessage: string | null
  composer: {
    text: string
    onTextChange: (text: string) => void
    canSend: boolean
    onSend: () => void
    onStarter: (starter: string) => void
    onStop: () => void
    onClear: () => void
    canClear: boolean
  }
}
