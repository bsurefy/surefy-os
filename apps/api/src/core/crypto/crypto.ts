// SPDX-License-Identifier: AGPL-3.0-only
import { fingerprintKeyOf, masterKeyIdOf, masterKeyOf } from './masterKey.js'
import { OrganizationKeyring } from './organizationKeys.js'
import { SecretCipher } from './secrets.js'

import type { Config } from '@/core/config/index.js'

/**
 * Envelope encryption (configuration.md, §5): `ENCRYPTION_KEY` wraps each organization's data
 * key, which encrypts the organization's secret columns.
 */
export function createCrypto(config: Config) {
  const masterKey = masterKeyOf(config.crypto.encryptionKey)
  const keyring = new OrganizationKeyring({ masterKey, masterKeyId: masterKeyIdOf(masterKey) })
  return { keyring, secrets: new SecretCipher(keyring, fingerprintKeyOf(masterKey)) }
}
export type Crypto = ReturnType<typeof createCrypto>
