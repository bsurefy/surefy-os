// SPDX-License-Identifier: AGPL-3.0-only
export type ProviderStatus = 'connected' | 'rate-limited' | 'expiring' | 'error' | 'not-connected'

export interface ProviderChipProps {
  /** Provider or local server name ("OpenAI", "Ollama on gpu-01"). */
  name: string
  status: ProviderStatus
  /** The status word: "Connected", "Rate limited", "Key expires in 5 days", "Error", "Not connected". */
  statusLabel: string
  /** A model on your own server: `success` tint. */
  isLocal?: boolean
  className?: string
}
