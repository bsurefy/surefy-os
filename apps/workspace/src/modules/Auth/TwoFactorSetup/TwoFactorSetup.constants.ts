// SPDX-License-Identifier: AGPL-3.0-only
export const TWO_FACTOR_SETUP_STEP = {
  PASSWORD: 'password',
  SCAN: 'scan',
  RECOVERY_CODES: 'recoveryCodes',
} as const
export type TwoFactorSetupStep = (typeof TWO_FACTOR_SETUP_STEP)[keyof typeof TWO_FACTOR_SETUP_STEP]

export const RECOVERY_CODES_FILE_NAME = 'surefyos-recovery-codes.txt'
