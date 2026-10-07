// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import Link from 'next/link'

import { toRoute } from '@/modules/Workspace'
import { MODULES } from '@surefy/contracts'
import type { AccessLimitsDto } from '@surefy/contracts'
import { StatusPill } from '@surefy/ui/components/DataDisplay'
import { ErrorState, SkeletonRows } from '@surefy/ui/components/Feedback'
import { Combobox, SegmentedControl } from '@surefy/ui/components/Forms'
import { Section } from '@surefy/ui/components/Layout'

import { findModuleReason, parseReasonKey, toLimitDisplayValue } from '../AccessSettings.utils'
import { SUBJECT_KIND } from './EffectiveAccess.constants'
import { useEffectiveAccessController } from './EffectiveAccess.controller'

const LIMIT_KEYS = [
  'monthlySpendMicros',
  'maxAgents',
  'maxFlows',
  'maxRunsPerMonth',
  'maxStorageBytes',
  'maxKnowledgeBases',
] as const satisfies readonly (keyof AccessLimitsDto)[]

/** Effective access of a person or a team: modules, limits, models, and the reason behind each. */
export default function EffectiveAccess() {
  const c = useEffectiveAccessController()
  const { t, access } = c

  let result
  if (c.subjectId === null) result = <p className="text-body text-muted-foreground">{t('pick')}</p>
  else if (c.isLoading) result = <SkeletonRows rows={4} rowClassName="h-10 px-0" />
  else if (c.errorMessage || !access) {
    result = (
      <ErrorState
        title={t('loadError')}
        message={c.errorMessage ?? t('loadError')}
        reference={c.errorReference}
        onRetry={c.refetch}
        size="sm"
      />
    )
  } else {
    result = (
      <div className="flex flex-col gap-6">
        <section aria-label={t('modules')}>
          <h3 className="text-section-title mb-2">{t('modules')}</h3>
          <ul className="flex flex-col divide-y">
            {MODULES.map((module) => {
              const isOn = access.modules.includes(module)
              const reason = findModuleReason(access.reasons, module)
              const href = reason ? c.getReasonHref(reason) : null
              return (
                <li key={module} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="text-body flex-1">{t(`moduleNames.${module}`)}</span>
                  <StatusPill
                    label={isOn ? t('on') : t('off')}
                    tone={isOn ? 'success' : 'neutral'}
                  />
                  {!isOn && reason && (
                    <span className="text-caption text-muted-foreground">
                      {t(`source.${reason.source}`)}
                      {href && (
                        <>
                          {' · '}
                          <Link
                            href={toRoute(href)}
                            className="text-primary underline-offset-4 hover:underline"
                          >
                            {t('change')}
                          </Link>
                        </>
                      )}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
        <section aria-label={t('limits')}>
          <h3 className="text-section-title mb-2">{t('limits')}</h3>
          <dl className="flex flex-col divide-y">
            {LIMIT_KEYS.map((key) => {
              const limit = access.limits[key]
              return (
                <div key={key} className="flex justify-between gap-4 py-2">
                  <dt className="text-body">{t(`limitNames.${key}`)}</dt>
                  <dd className="text-body text-muted-foreground">
                    {limit === null
                      ? t('unlimited')
                      : t(`limitValue.${key}`, { value: toLimitDisplayValue(key, limit) })}
                  </dd>
                </div>
              )
            })}
          </dl>
        </section>
        <section aria-label={t('models')}>
          <h3 className="text-section-title mb-2">{t('models')}</h3>
          <p className="text-body text-muted-foreground">
            {access.allowedModelIds === 'all'
              ? t('allModels')
              : t('modelCount', { count: access.allowedModelIds.length })}
          </p>
        </section>
        {access.reasons.length > 0 && (
          <section aria-label={t('why')}>
            <h3 className="text-section-title mb-2">{t('why')}</h3>
            <ul className="flex flex-col gap-1">
              {access.reasons.map((reason) => {
                const { type, name } = parseReasonKey(reason.key)
                const href = c.getReasonHref(reason)
                return (
                  <li key={reason.key} className="text-body">
                    {t('reason', {
                      thing: t(`reasonType.${type}`, { name }),
                      source: t(`source.${reason.source}`),
                    })}
                    {href && (
                      <>
                        {' · '}
                        <Link
                          href={toRoute(href)}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {t('change')}
                        </Link>
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </div>
    )
  }

  return (
    <Section title={t('title')} description={t('description')}>
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl
          label={t('kind')}
          options={[
            { value: SUBJECT_KIND.PERSON, label: t('kinds.person') },
            { value: SUBJECT_KIND.TEAM, label: t('kinds.team') },
          ]}
          value={c.kind}
          onValueChange={c.onKindChange}
        />
        <div className="w-72 max-w-full">
          <Combobox
            key={c.kind}
            options={c.options}
            value={c.subjectId}
            onValueChange={c.onSubjectChange}
            aria-label={t('subject')}
            labels={{
              placeholder: c.kind === SUBJECT_KIND.PERSON ? t('choosePerson') : t('chooseTeam'),
              search: t('search'),
              empty: t('empty'),
            }}
          />
        </div>
      </div>
      {result}
    </Section>
  )
}
