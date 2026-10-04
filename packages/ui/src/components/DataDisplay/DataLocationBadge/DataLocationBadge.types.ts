// SPDX-License-Identifier: AGPL-3.0-only
export interface DataLocationBadgeProps {
  /** `local`: the model runs on your server; `provider`: the data goes to an AI provider. */
  location: 'local' | 'provider'
  /** "Stays on your server" or "Sent to OpenAI". Translated text. */
  label: string
  className?: string
}
