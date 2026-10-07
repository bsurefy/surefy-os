// SPDX-License-Identifier: AGPL-3.0-only
export { vaultApi } from './vault.api'
export {
  useCreateCredentialMutation,
  useCreateLocalServerMutation,
  useCreatePersonalCredentialMutation,
  useMakePrimaryMutation,
  useRemoveLocalServerMutation,
  useRevokeCredentialMutation,
  useSyncLocalServerMutation,
  useTestConnectionMutation,
  useTestCredentialMutation,
  useUpdateCredentialMutation,
} from './vault.mutations'
export { vaultKeys, vaultQueries } from './vault.queries'
export type { CredentialListFilters, MyCredentialListFilters } from './vault.queries'
