// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { organizationQueries, useUpdateOrganizationMutation } from '@/api/organizations'
import { toast } from '@surefy/ui/components/Feedback'
import { useCurrentOrgId } from '@surefy/web-core/access'

/** Chat sharing on or off; saved as soon as it is switched. */
export function usePrivacySectionController() {
  const t = useTranslations('settings.dataPrivacy.privacy')
  const orgId = useCurrentOrgId()
  const { data: organization } = useQuery(organizationQueries.detail(orgId))
  const update = useUpdateOrganizationMutation(orgId)

  return {
    isLoaded: organization !== undefined,
    isChatSharingOn: organization?.settings.privacy.chatSharingEnabled ?? true,
    isSaving: update.isPending,
    onChatSharingChange: (enabled: boolean) => {
      update.mutate(
        { settings: { privacy: { chatSharingEnabled: enabled } } },
        { onSuccess: () => toast.success(t('saved')) },
      )
    },
    t,
  }
}
