// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import Link from 'next/link'

import FeatureGateCard from '@surefy/ui/components/Feedback/FeatureGateCard'
import { Button } from '@surefy/ui/primitives/button'

import { useUpgradeCardController } from './UpgradeCard.controller'

import type { UpgradeCardProps } from './UpgradeCard.types'

/**
 * The feature-gate card for one feature: what it does, the edition that includes it, and what
 * this person can do about it. Install administrators get "Enter license key", people who manage
 * billing "See plans", everyone else "Ask an owner to upgrade". Copy comes from `editions`.
 */
export function UpgradeCard(props: Readonly<UpgradeCardProps>) {
  const { preview, headingLevel, className } = props
  const {
    title,
    description,
    previewLabel,
    editionLabel,
    compareEditionsUrl,
    licenseHref,
    plansHref,
    canUpgrade,
    t,
  } = useUpgradeCardController(props)

  const hasActions = Boolean(compareEditionsUrl ?? licenseHref ?? plansHref)
  const actions = hasActions ? (
    <>
      {plansHref && (
        <Button asChild>
          <Link href={plansHref}>{t('gate.seePlans')}</Link>
        </Button>
      )}
      {licenseHref && (
        <Button asChild>
          <Link href={licenseHref}>{t('gate.enterLicenseKey')}</Link>
        </Button>
      )}
      {compareEditionsUrl && (
        <Button asChild variant="secondary">
          <a href={compareEditionsUrl} target="_blank" rel="noopener noreferrer">
            {t('gate.compareEditions')}
          </a>
        </Button>
      )}
    </>
  ) : undefined

  return (
    <FeatureGateCard
      title={title}
      description={description}
      editionLabel={editionLabel}
      actions={actions}
      note={canUpgrade ? undefined : t('gate.askOwner')}
      preview={preview}
      previewLabel={previewLabel}
      headingLevel={headingLevel}
      className={className}
    />
  )
}
