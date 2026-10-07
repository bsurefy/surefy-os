// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Safety net for secrets that reach a log call by mistake. The rule is to never log them in the
 * first place (logging-observability.md, "Never log").
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.apiKey',
  '*.password',
  '*.secret',
  '*.token',
  '*.authorization',
  '*.cookie',
] as const
