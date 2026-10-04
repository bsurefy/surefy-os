// SPDX-License-Identifier: AGPL-3.0-only

/** Effective access stays cached this long, so time-based license states apply without a write. */
export const EFFECTIVE_ACCESS_TTL_SECONDS = 600

/** The public page that compares the editions (ADR 0020): a constant, never an environment variable. */
export const COMPARE_EDITIONS_URL = 'https://surefyos.com/editions'
