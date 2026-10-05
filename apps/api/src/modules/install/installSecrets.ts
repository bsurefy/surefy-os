// SPDX-License-Identifier: AGPL-3.0-only
// Envelope encryption of the install's secrets (configuration.md, §5): `ENCRYPTION_KEY` wraps
// the install data key, which encrypts the SMTP password. The primitives are the shared
// `core/crypto` ones; the additional authenticated data names the install's own columns.

export {
  masterKeyIdOf,
  masterKeyOf,
  newDataKey,
  seal,
  unseal,
  type Sealed,
} from '@/core/crypto/index.js'

/** AAD of the wrapped install data key. */
export const DATA_KEY_AAD = 'install_settings:1:data_key'
/** AAD of the SMTP password (organizations-and-members.md, §9). */
export const SMTP_PASSWORD_AAD = 'install_settings:1:install'
