// SPDX-License-Identifier: AGPL-3.0-only
import { MessageSquare } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { EmptyState } from '@surefy/ui/components/DataDisplay'
import { PageHeader } from '@surefy/ui/components/Layout'

/**
 * A chat: the empty new chat, or one conversation. Module skeleton stub: the page header and empty
 * state until the screen is built.
 */
export default function ChatThread() {
  const t = useTranslations('chat.thread')
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} />
      <EmptyState
        icon={MessageSquare}
        title={t('empty.title')}
        description={t('empty.description')}
      />
    </div>
  )
}
