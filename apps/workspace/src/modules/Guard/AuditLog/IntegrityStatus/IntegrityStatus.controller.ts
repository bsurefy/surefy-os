// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query'
import { useFormatter, useTranslations } from 'next-intl'

import { auditQueries, useVerifyAuditMutation } from '@/api/audit'
import { toast } from '@surefy/ui/components/Feedback'

import { AUDIT_TIME_FORMAT } from '../AuditLog.constants'

/** The chain's integrity status and the on-demand verification. */
export function useIntegrityStatusController(orgId: string) {
  const t = useTranslations('guard.auditLog.integrity')
  const format = useFormatter()
  const { data: status } = useQuery(auditQueries.integrity(orgId))
  const verify = useVerifyAuditMutation(orgId)
  const formatTime = (value: string) => format.dateTime(new Date(value), AUDIT_TIME_FORMAT)

  return {
    status,
    lastVerified: status?.lastVerifiedAt ? formatTime(status.lastVerifiedAt) : null,
    lastCheckpoint: status?.lastSignedCheckpointAt
      ? formatTime(status.lastSignedCheckpointAt)
      : null,
    isVerifying: verify.isPending,
    onVerify: () => {
      verify.mutate(undefined, { onSuccess: () => toast.success(t('verifyStarted')) })
    },
    t,
  }
}
