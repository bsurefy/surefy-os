// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import {
  approvalQueries,
  useApproveApprovalMutation,
  useRejectApprovalMutation,
} from '@/api/approvals'
import { ERROR_CODES } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { QUEUE_REFRESH_MS } from '../Approvals.constants'
import {
  canEdit,
  getActionInput,
  getEditedInput,
  hasAction,
  toFieldDraft,
} from './ApprovalDetail.utils'

import type { RejectValues } from '../RejectDialog'

/** Failures after which the item is refetched and shows who decided it, or that it timed out. */
const SETTLED_CODES: string[] = [ERROR_CODES.APPROVAL_ALREADY_DECIDED, ERROR_CODES.APPROVAL_EXPIRED]

/**
 * One approval: what will happen, the decision (approve, edit and approve, reject) and its
 * failures. Re-authentication is asked by the app's "Confirm it's you" dialog; nothing is recorded
 * until the person approves again.
 */
export function useApprovalDetailController() {
  const t = useTranslations('insights.approvals.detail')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const { orgSlug, approvalId } = useParams<{ orgSlug: string; approvalId: string }>()
  const detail = useQuery({
    ...approvalQueries.detail(orgId, approvalId),
    // other people decide while this is open
    refetchInterval: (query) => (query.state.data?.status === 'pending' ? QUEUE_REFRESH_MS : false),
  })
  const approve = useApproveApprovalMutation(orgId, { silent: true })
  const reject = useRejectApprovalMutation(orgId, { silent: true })
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string>()
  const [isRejecting, setIsRejecting] = useState(false)
  const [rejectError, setRejectError] = useState<string>()
  /** Set when this person's decision just went through, so the banner does not say "already". */
  const [justDecided, setJustDecided] = useState(false)

  const item = detail.data
  const original = item && hasAction(item.payload) ? item.payload.action.input : null

  const edited = isEditing && original ? getEditedInput(original, draft) : null
  const editedKeys =
    edited && original
      ? Object.keys(original).filter((key) => edited.input[key] !== original[key])
      : []

  const startEditing = () => {
    if (!original) return
    setDraft(toFieldDraft(original))
    setFieldErrors({})
    setFormError(undefined)
    setIsEditing(true)
  }
  const stopEditing = () => {
    setIsEditing(false)
    setFieldErrors({})
    setFormError(undefined)
  }

  const handleError = (error: unknown) => {
    if (!isApiError(error)) throw error
    // the confirmation dialog is the one message for this failure
    if (error.code === ERROR_CODES.AUTH_SESSION_NOT_FRESH) return
    // the item reloads and says who decided first, or that it timed out
    if (SETTLED_CODES.includes(error.code)) {
      stopEditing()
      return
    }
    if (error.code === ERROR_CODES.VALIDATION_FAILED && error.details.length > 0) {
      setFieldErrors(
        Object.fromEntries(error.details.map((detail) => [detail.path, detail.message])),
      )
      setFormError(t('fieldErrors'))
      return
    }
    setFormError(getErrorMessage(error, tErrors))
  }

  const onApprove = async () => {
    if (!item) return
    setFormError(undefined)
    let editedInput: Record<string, unknown> | undefined
    if (isEditing && original) {
      const result = getEditedInput(original, draft)
      if (result.invalidKeys.length > 0) {
        setFieldErrors(
          Object.fromEntries(result.invalidKeys.map((key) => [key, t('invalidNumber')])),
        )
        setFormError(t('fieldErrors'))
        return
      }
      if (result.isChanged) editedInput = result.input
    }
    try {
      await approve.mutateAsync({ approvalId: item.id, editedInput, via: 'queue' })
      setJustDecided(true)
      stopEditing()
      toast.success(editedInput ? t('decided.approvedEdited') : t('decided.approved'))
    } catch (error) {
      handleError(error)
    }
  }

  const onReject = async ({ reason, note }: RejectValues) => {
    if (!item) return
    try {
      await reject.mutateAsync({ approvalId: item.id, reason, note })
      setJustDecided(true)
      stopEditing()
    } catch (error) {
      if (isApiError(error) && SETTLED_CODES.includes(error.code)) {
        setIsRejecting(false)
        return
      }
      if (isApiError(error) && error.code === ERROR_CODES.AUTH_SESSION_NOT_FRESH) {
        setIsRejecting(false)
        return
      }
      setRejectError(getErrorMessage(error, tErrors))
      throw error
    }
  }

  return {
    orgSlug,
    item,
    isLoading: detail.isPending,
    isNotFound: isApiError(detail.error) && detail.error.code === ERROR_CODES.APPROVAL_NOT_FOUND,
    errorMessage: detail.error ? getErrorMessage(detail.error, tErrors) : null,
    errorReference: isApiError(detail.error) ? detail.error.requestId : undefined,
    refetch: () => void detail.refetch(),
    actionInput: item ? getActionInput(item) : null,
    canEdit: item ? canEdit(item) : false,
    isEditing,
    draft,
    onDraftChange: (key: string, value: string) => {
      setDraft((current) => ({ ...current, [key]: value }))
      setFieldErrors((current) =>
        Object.fromEntries(Object.entries(current).filter(([k]) => k !== key)),
      )
    },
    fieldErrors,
    formError,
    editedKeys,
    onStartEditing: startEditing,
    onStopEditing: stopEditing,
    isApproving: approve.isPending,
    onApprove: () => void onApprove(),
    isRejecting,
    onRejectOpenChange: (open: boolean) => {
      setIsRejecting(open)
      if (!open) setRejectError(undefined)
    },
    rejectError,
    onReject,
    justDecided,
    t,
  }
}
