// SPDX-License-Identifier: AGPL-3.0-only
import { ORGANIZATION_SLUG_PATTERN } from '@surefy/contracts'
import type { OrganizationDto } from '@surefy/contracts'

import type { GeneralSettingsValues } from './GeneralSettings.schema'

/**
 * The IANA zones of this runtime, for the picker and the check. `UTC` is added because the list
 * leaves it out, while a browser set to UTC reports it and setup stores it as the organization's.
 */
export function getTimeZones(): string[] {
  const zones = Intl.supportedValuesOf('timeZone')
  return zones.includes('UTC') ? zones : ['UTC', ...zones]
}

export function isSupportedTimeZone(value: string): boolean {
  return getTimeZones().includes(value)
}

/** The form's values for a saved organization. */
export function toGeneralSettingsValues(organization: OrganizationDto): GeneralSettingsValues {
  return {
    name: organization.name,
    slug: organization.slug,
    timezone: organization.timezone,
    defaultLocale: organization.defaultLocale,
  }
}

/** Whether the typed address is worth asking the server about. */
export function isCheckableSlug(slug: string, currentSlug: string): boolean {
  return slug !== currentSlug && ORGANIZATION_SLUG_PATTERN.test(slug)
}
