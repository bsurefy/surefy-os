// SPDX-License-Identifier: AGPL-3.0-only
export interface ResetPasswordProps {
  /** `?token=` of the link in the email; missing when the link failed. */
  token?: string
  /** `?error=` of the link: it is expired, used or unknown. */
  hasLinkError?: boolean
}
