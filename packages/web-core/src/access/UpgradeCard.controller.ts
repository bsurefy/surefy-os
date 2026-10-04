// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { FEATURE_EDITIONS, PERMISSIONS, type Feature } from '@surefy/contracts'

import { useUpgradeLinks } from './UpgradeLinksProvider'
import { useCan } from './useCan'
import { meQueries } from '../api/me/me.queries'

import type { UpgradeCardProps } from './UpgradeCard.types'
import type { EditionsMessages } from '../i18n/i18n.types'

type FeatureMessageKey = keyof EditionsMessages['features']

/** `custom-roles` → `customRoles`: message keys are camelCase, feature keys kebab-case. */
export function getFeatureMessageKey(feature: Feature): FeatureMessageKey {
  return feature.replaceAll(/-([a-z])/g, (_, letter: string) =>
    letter.toUpperCase(),
  ) as FeatureMessageKey
}

export function useUpgradeCardController({ feature }: UpgradeCardProps) {
  // 1. external hooks
  const t = useTranslations('editions')
  const { data: me } = useQuery(meQueries.current())
  const canManageBilling = useCan(PERMISSIONS.BILLING_MANAGE)
  const links = useUpgradeLinks()

  // 5. derived values
  const key = getFeatureMessageKey(feature)
  const editionLabel = t(`edition.${FEATURE_EDITIONS[feature].minimum}`)
  const licenseHref = me?.isInstallAdmin ? links.licenseHref : undefined
  const plansHref = canManageBilling ? links.plansHref : undefined
  const canUpgrade = licenseHref !== undefined || plansHref !== undefined

  // 7. flat return
  return {
    title: t(`features.${key}.title`, { edition: editionLabel }),
    description: t(`features.${key}.description`),
    previewLabel: t('gate.previewLabel', { feature: t(`features.${key}.name`) }),
    editionLabel,
    compareEditionsUrl: links.compareEditionsUrl,
    licenseHref,
    plansHref,
    canUpgrade,
    t,
  }
}
