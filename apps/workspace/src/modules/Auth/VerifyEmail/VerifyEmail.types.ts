// SPDX-License-Identifier: AGPL-3.0-only
export interface VerifyEmailProps {
  /** `?error=` of the verification link: the link was expired, used or unknown. */
  hasLinkError?: boolean
}
