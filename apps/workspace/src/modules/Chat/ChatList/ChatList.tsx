// SPDX-License-Identifier: AGPL-3.0-only
import { MessagesSquare } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { EmptyState } from '@surefy/ui/components/DataDisplay'

/** The chat list beside the thread. Module skeleton stub: the empty state until it is built. */
export default function ChatList() {
  const t = useTranslations('chat.list')
  return (
    <aside aria-label={t('label')} className="border-border hidden w-70 shrink-0 border-r lg:block">
      <EmptyState
        icon={MessagesSquare}
        title={t('empty.title')}
        description={t('empty.description')}
        headingLevel={3}
      />
    </aside>
  )
}
