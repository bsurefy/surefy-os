// SPDX-License-Identifier: AGPL-3.0-only
import { vaultSettings } from '@/database/tables/index.js'

import type { OrganizationKeyring } from '@/core/crypto/index.js'
import type { DbTransaction } from '@/core/database/index.js'
import type { OrganizationInitializer } from '@/modules/organizations/index.js'

/**
 * What every organization has from its first moment (vault-and-models.md, §1 and §5): its data key
 * version 1 and its settings row, so reads never need an upsert. Runs in the creating transaction.
 */
export function createVaultOrganizationSetup(deps: {
  keyring: OrganizationKeyring
}): OrganizationInitializer {
  return {
    async initializeInTx(tx: DbTransaction, orgId: string) {
      await deps.keyring.createInitialKey(tx, orgId)
      await tx.insert(vaultSettings).values({ organizationId: orgId }).onConflictDoNothing()
    },
  }
}
