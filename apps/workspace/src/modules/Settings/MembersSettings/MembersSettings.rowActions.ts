// SPDX-License-Identifier: AGPL-3.0-only
import { useTranslations } from 'next-intl'

import {
  useCreateInvitationLinkMutation,
  useReactivateMemberMutation,
  useResendInvitationMutation,
} from '@/api/members'
import { toast } from '@surefy/ui/components/Feedback'

/** The row actions that need no dialog: resend, copy the invite link, reactivate. */
export function useMemberRowActions(orgId: string) {
  const t = useTranslations('settings.members')
  const resend = useResendInvitationMutation(orgId)
  const link = useCreateInvitationLinkMutation(orgId)
  const reactivate = useReactivateMemberMutation(orgId)

  return {
    onResend: (invitationId: string) => {
      resend.mutate(invitationId, { onSuccess: () => toast.success(t('resent')) })
    },
    onCopyLink: (invitationId: string) => {
      link.mutate(invitationId, {
        onSuccess: (result) => {
          void navigator.clipboard.writeText(result.url).then(() => toast.success(t('linkCopied')))
        },
      })
    },
    onReactivate: (memberId: string) => {
      reactivate.mutate(memberId, { onSuccess: () => toast.success(t('reactivated')) })
    },
  }
}
