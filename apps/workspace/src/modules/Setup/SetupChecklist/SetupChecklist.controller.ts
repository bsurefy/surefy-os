// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { setupQueries, useSetChecklistDismissedMutation } from '@/api/setup'
import { toast } from '@surefy/ui/components/Feedback'
import { useCurrentOrgId } from '@surefy/web-core/access'

/**
 * The home-screen checklist: the organization's items with what is done, hidden once the member
 * dismissed it or everything is done. A failed load simply hides it; it is guidance, not content.
 */
export function useSetupChecklistController() {
  const t = useTranslations('setup.checklist')
  const orgId = useCurrentOrgId()
  const { data } = useQuery(setupQueries.checklist(orgId))
  const dismiss = useSetChecklistDismissedMutation(orgId)

  const items = data?.items ?? []
  const doneCount = items.filter((item) => item.done).length
  return {
    items,
    doneCount,
    isVisible:
      data !== undefined && !data.dismissed && items.length > 0 && doneCount < items.length,
    onDismiss: () => {
      dismiss.mutate(true, {
        onSuccess: () => {
          toast.success(t('dismissed'))
        },
      })
    },
    isDismissing: dismiss.isPending,
    t,
  }
}
