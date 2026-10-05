// SPDX-License-Identifier: AGPL-3.0-only
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { useConnectedModels } from '../Setup.hooks'

export type ModelDialog = 'key' | 'server' | null

/**
 * The AI model step: which keys and servers are connected (read from the Vault), and which of
 * Vault's two add dialogs is open.
 */
export function useModelStepController(orgId: string) {
  const t = useTranslations('setup.model')
  const [dialog, setDialog] = useState<ModelDialog>(null)
  const models = useConnectedModels(orgId)
  return {
    ...models,
    dialog,
    openKey: () => {
      setDialog('key')
    },
    openServer: () => {
      setDialog('server')
    },
    closeDialog: () => {
      setDialog(null)
    },
    t,
  }
}
