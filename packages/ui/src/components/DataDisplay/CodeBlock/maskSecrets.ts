// SPDX-License-Identifier: AGPL-3.0-only
// Known key shapes: OpenAI/Anthropic-style `sk-`, Stripe live/test keys, GitHub tokens, Slack tokens,
// AWS access key ids, and bearer tokens. Each pattern is anchored on a fixed prefix, so it stays linear.
const SECRET_PATTERNS = [
  /\b(sk-[\w-]{4})[\w-]{8,}/g,
  /\b([rs]k_(?:live|test)_[\dA-Za-z]{4})[\dA-Za-z]{8,}/g,
  /\b(gh[opsu]_[\dA-Za-z]{4})[\dA-Za-z]{16,}/g,
  /\b(xox[abp]-[\dA-Za-z]{4})[\w-]{8,}/g,
  /\b(AKIA[\dA-Z]{4})[\dA-Z]{12}\b/g,
  /(Bearer [\w.~+/-]{4})[\w.~+/-]{8,}=*/g,
]

/** Keeps the first characters of each secret and hides the rest: `sk-ab12••••••••`. */
export function maskSecrets(code: string) {
  return SECRET_PATTERNS.reduce((text, pattern) => text.replace(pattern, '$1••••••••'), code)
}
