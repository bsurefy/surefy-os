// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import type { AgentDefinitionChange } from '@surefy/contracts'
import { SkeletonText } from '@surefy/ui/components/Feedback'
import { Section } from '@surefy/ui/components/Layout'

import AgentChangeList from '../../AgentChangeList'

interface ChangesSectionProps {
  /** The version that is live now; none before the first publish. */
  liveVersion: number | null
  /** What the draft changes against it; null while the live version loads. */
  changes: readonly AgentDefinitionChange[] | null
}

/** Changes since the last version: what Publish puts live. */
export default function ChangesSection({ liveVersion, changes }: Readonly<ChangesSectionProps>) {
  const t = useTranslations('agents.editor.publish.changes')

  let body
  if (liveVersion === null) body = <p className="text-body">{t('first')}</p>
  else if (changes === null) body = <SkeletonText lines={2} />
  else if (changes.length === 0) body = <p className="text-body">{t('none')}</p>
  else body = <AgentChangeList changes={changes} />

  return (
    <Section
      title={liveVersion === null ? t('title') : t('titleSince', { version: liveVersion })}
      description={t('description')}
    >
      {body}
    </Section>
  )
}
