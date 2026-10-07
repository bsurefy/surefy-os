// SPDX-License-Identifier: AGPL-3.0-only
import type { OrganizationDto } from '@surefy/contracts'

import type { SessionLengthOption } from './SecuritySettings.constants'
import type { SecuritySettingsValues } from './SecuritySettings.schema'

/** The hours behind a picker value; null keeps the app default. */
export function sessionLengthToHours(option: SessionLengthOption): number | null {
  return option === 'default' ? null : Number(option)
}

/** The picker value for a stored length; a length the picker does not offer shows as the default. */
export function hoursToSessionLength(hours: number | null): SessionLengthOption {
  const option = String(hours)
  return option === '8' || option === '24' || option === '168' || option === '720'
    ? option
    : 'default'
}

export function toSecuritySettingsValues(organization: OrganizationDto): SecuritySettingsValues {
  const { require2fa, sessionMaxHours } = organization.settings.security
  return { require2fa, sessionLength: hoursToSessionLength(sessionMaxHours) }
}

/** Turning the requirement on changes sign-in for people who have no second factor yet. */
export function isTwoFactorTurnedOn(
  organization: OrganizationDto,
  values: SecuritySettingsValues,
): boolean {
  return values.require2fa && !organization.settings.security.require2fa
}
