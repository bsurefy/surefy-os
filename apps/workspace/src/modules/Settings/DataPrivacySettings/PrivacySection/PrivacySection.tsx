// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { SwitchField } from '@surefy/ui/components/Forms'
import { Section } from '@surefy/ui/components/Layout'

import { usePrivacySectionController } from './PrivacySection.controller'

/** Chat sharing: whether people may share chats with others in the organization. */
export default function PrivacySection({ canChange }: Readonly<{ canChange: boolean }>) {
  const c = usePrivacySectionController()

  return (
    <Section title={c.t('title')}>
      <SwitchField
        label={c.t('chatSharing.label')}
        description={c.t('chatSharing.description')}
        checked={c.isChatSharingOn}
        disabled={!canChange || !c.isLoaded || c.isSaving}
        onCheckedChange={c.onChatSharingChange}
      />
    </Section>
  )
}
