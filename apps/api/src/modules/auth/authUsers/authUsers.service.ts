// SPDX-License-Identifier: AGPL-3.0-only
import { OAUTH_PROVIDERS, type SignInMethodDto, type UserRefDto } from '@surefy/contracts'

import { AuthUsersRepository, type UserRow } from './authUsers.repository.js'

import type { Database } from '@/core/database/index.js'
import type { StorageProvider } from '@/integrations/storage/index.js'

/** What the Members table shows about a person beyond their display data. */
export interface MemberProfile {
  user: UserRefDto
  twoFactorEnabled: boolean
  signInMethod: SignInMethodDto
}

const OAUTH = new Set<string>(OAUTH_PROVIDERS)

/** Derived, never stored: SSO wins over a password, a password over OAuth. */
const signInMethodOf = (providerIds: readonly string[]): SignInMethodDto => {
  const sso = providerIds.find((id) => id !== 'credential' && !OAUTH.has(id))
  if (sso !== undefined) return { type: 'sso', providerId: sso }
  if (providerIds.includes('credential')) return { type: 'password', providerId: null }
  const oauth = providerIds.find((id) => OAUTH.has(id))
  if (oauth !== undefined) return { type: 'oauth', providerId: oauth }
  return { type: 'password', providerId: null }
}

/** Avatar links are short-lived signed URLs (identity-and-auth.md, §1). */
const AVATAR_URL_TTL_SECONDS = 15 * 60

export interface AuthUsersDeps {
  db: Database
  storage: StorageProvider
  repository?: AuthUsersRepository
}

/**
 * Identity reads for other modules (identity-and-auth.md: "other modules read identity through
 * the `auth` service, never through these tables"): display data by id and the disabled flag the
 * session hook checks. Built before the other modules, so they can depend on it.
 */
export class AuthUsersService {
  private readonly repository: AuthUsersRepository

  constructor(private readonly deps: AuthUsersDeps) {
    this.repository = deps.repository ?? new AuthUsersRepository()
  }

  findById(userId: string): Promise<UserRow | undefined> {
    return this.repository.findById(this.deps.db.global, userId)
  }

  /** `UserRefDto` per id; unknown ids are missing from the map. */
  async findUserRefs(userIds: readonly string[]): Promise<ReadonlyMap<string, UserRefDto>> {
    const refs = new Map<string, UserRefDto>()
    if (userIds.length === 0) return refs
    const rows = await this.repository.findByIds(this.deps.db.global, [...new Set(userIds)])
    for (const row of rows) {
      refs.set(row.id, {
        id: row.id,
        name: row.name,
        email: row.email,
        imageUrl: await this.imageUrl(row.image),
      })
    }
    return refs
  }

  /** Display data, two-factor state and sign-in method per id; unknown ids are missing. */
  async findMemberProfiles(
    userIds: readonly string[],
  ): Promise<ReadonlyMap<string, MemberProfile>> {
    const profiles = new Map<string, MemberProfile>()
    if (userIds.length === 0) return profiles
    const ids = [...new Set(userIds)]
    const [rows, accounts] = await Promise.all([
      this.repository.findByIds(this.deps.db.global, ids),
      this.repository.findAccountProviders(this.deps.db.global, ids),
    ])
    const providers = new Map<string, string[]>()
    for (const account of accounts) {
      providers.set(account.userId, [...(providers.get(account.userId) ?? []), account.providerId])
    }
    for (const row of rows) {
      profiles.set(row.id, {
        user: {
          id: row.id,
          name: row.name,
          email: row.email,
          imageUrl: await this.imageUrl(row.image),
        },
        twoFactorEnabled: row.twoFactorEnabled,
        signInMethod: signInMethodOf(providers.get(row.id) ?? []),
      })
    }
    return profiles
  }

  /** Unknown users count as disabled: nobody gets a session for a missing account. */
  async isDisabled(userId: string): Promise<boolean> {
    const disabledAt = await this.repository.findDisabledAt(this.deps.db.global, userId)
    return disabledAt !== null
  }

  updateName(userId: string, name: string): Promise<void> {
    return this.repository.updateName(this.deps.db.global, userId, name)
  }

  /** The signed URL of a stored avatar; null when the person has none. */
  imageUrl(key: string | null): Promise<string | null> {
    if (key === null) return Promise.resolve(null)
    return this.deps.storage.getSignedUrl(key, { expiresInSeconds: AVATAR_URL_TTL_SECONDS })
  }
}
