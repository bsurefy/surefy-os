// SPDX-License-Identifier: AGPL-3.0-only
export interface TwoFactorSetupProps {
  /** `?redirect=` of the page: where to go once two-factor is on; only a same-origin path is used. */
  redirect?: string
}
