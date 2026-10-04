// SPDX-License-Identifier: AGPL-3.0-only
import { FEATURE_EDITIONS } from '@surefy/contracts'
import type { Feature } from '@surefy/contracts'

/** The minimum edition of a feature, for its lock badge (`editions.edition.<minimum>`). */
export function getFeatureEdition(feature: Feature): 'enterprise' | 'cloud' {
  return FEATURE_EDITIONS[feature].minimum
}

/** The language's own name ("English", "Deutsch"), from the browser's locale data. */
export function getLanguageName(locale: string): string {
  return new Intl.DisplayNames([locale], { type: 'language' }).of(locale) ?? locale
}
