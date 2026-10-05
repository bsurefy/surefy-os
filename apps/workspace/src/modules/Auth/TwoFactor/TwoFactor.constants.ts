// SPDX-License-Identifier: AGPL-3.0-only
export const TWO_FACTOR_MODE = { CODE: 'code', RECOVERY: 'recovery' } as const
export type TwoFactorMode = (typeof TWO_FACTOR_MODE)[keyof typeof TWO_FACTOR_MODE]
