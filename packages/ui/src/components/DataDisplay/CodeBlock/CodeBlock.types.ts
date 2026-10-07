// SPDX-License-Identifier: AGPL-3.0-only
export interface CodeBlockProps {
  code: string
  /** Language label shown in the header ("bash", "json"). */
  language?: string
  /** Translated "Copy" and "Copied" labels. */
  labels: { copy: string; copied: string }
  /** Masks API keys and tokens in what is shown and copied. Default true. */
  shouldMaskSecrets?: boolean
  /** Longest height before the block scrolls, in px. Default 400. */
  maxHeight?: number
  className?: string
}
