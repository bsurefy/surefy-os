// SPDX-License-Identifier: AGPL-3.0-only
import { StorageInvalidKeyError } from './storage.errors.js'

// Object keys: relative, slash-separated, printable ASCII without traversal segments. The same rule
// for every provider, so a key accepted by S3 is also safe as a path on the local filesystem.
const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._\-/]{0,1023}$/

/** Returns the key when it is well-formed; throws `StorageInvalidKeyError` otherwise. */
export function assertStorageKey(key: string): string {
  if (!KEY_PATTERN.test(key) || key.endsWith('/') || key.includes('//')) {
    throw new StorageInvalidKeyError(key)
  }
  if (key.split('/').some((segment) => segment === '.' || segment === '..')) {
    throw new StorageInvalidKeyError(key)
  }
  return key
}

/** A prefix is a key with a trailing slash, or a key itself. */
export function assertStoragePrefix(prefix: string): string {
  return `${assertStorageKey(prefix.endsWith('/') ? prefix.slice(0, -1) : prefix)}/`
}
