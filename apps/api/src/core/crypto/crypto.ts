// SPDX-License-Identifier: AGPL-3.0-only
import { fingerprintKeyOf, MasterKeys } from './masterKey.js'
import { OrganizationKeyring } from './organizationKeys.js'
import { SecretCipher } from './secrets.js'

import type { Config } from '@/core/config/index.js'

/**
 * Envelope encryption (configuration.md, §5): `ENCRYPTION_KEY` wraps each organization's data
 * key, which encrypts the organization's secret columns. `ENCRYPTION_KEY_PREVIOUS` only unwraps,
 * while a master key change is re-wrapped.
 */
export function createCrypto(config: Config) {
  const masterKeys = new MasterKeys(
    config.crypto.encryptionKey,
    config.crypto.previousEncryptionKey,
  )
  const keyring = new OrganizationKeyring({ masterKeys })
  return {
    masterKeys,
    keyring,
    secrets: new SecretCipher(keyring, fingerprintKeyOf(masterKeys.current.key)),
  }
}
export type Crypto = ReturnType<typeof createCrypto>
