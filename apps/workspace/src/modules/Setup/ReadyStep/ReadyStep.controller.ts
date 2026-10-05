// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { useCreateInvitationLinkMutation, useCreateInvitationMutation } from '@/api/members'
import { useCompleteSetupMutation } from '@/api/setup'
import { ROUTES } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import type { OrgRole, SetupStep } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { INVITE_EMAILS_MAX } from '../Setup.constants'
import { useConnectedModels } from '../Setup.hooks'
import { parseEmails } from '../Setup.utils'

import type { SetupOrganization } from '../Setup.types'
import type { BaseSyntheticEvent } from 'react'

export interface ReadyStepProps {
  organization: SetupOrganization
  /** Whether the server can send email; without it invitations are shared as links. */
  hasEmail: boolean
  onChangeModel: () => void
}

export interface InviteResult {
  email: string
  invitationId?: string
  isUndelivered?: boolean
  error?: string
}

// The seat limit applies to every address, so the loop stops at the first answer with it.
const LIMIT_REACHED = 'LIMIT_REACHED'

/**
 * Ready: the summary, optional invitations (one request per address; failures stay per address),
 * and "Open Chat", which records the steps that were skipped and leaves setup.
 */
export function useReadyStepController({ organization, hasEmail }: ReadyStepProps) {
  const t = useTranslations('setup.ready')
  const tErrors = useTranslations('errors')
  const router = useRouter()
  const models = useConnectedModels(organization.id)
  const complete = useCompleteSetupMutation(organization.id, { silent: true })
  const create = useCreateInvitationMutation(organization.id, { silent: true })
  const link = useCreateInvitationLinkMutation(organization.id)
  const [emailsText, setEmailsText] = useState('')
  const [role, setRole] = useState<OrgRole>('user')
  const [results, setResults] = useState<InviteResult[]>([])
  const [emailsError, setEmailsError] = useState<string | undefined>()
  const [inviteError, setInviteError] = useState<string | undefined>()
  const [finishError, setFinishError] = useState<string | undefined>()
  const [isSending, setIsSending] = useState(false)

  const done = new Set(results.filter((result) => !result.error).map((result) => result.email))
  const pending = parseEmails(emailsText).filter((email) => !done.has(email))

  const send = async () => {
    setEmailsError(undefined)
    setInviteError(undefined)
    if (pending.length === 0) {
      setEmailsError(t('invite.emailsRequired'))
      return
    }
    if (pending.length > INVITE_EMAILS_MAX) {
      setEmailsError(t('invite.emailsTooMany', { max: INVITE_EMAILS_MAX }))
      return
    }
    setIsSending(true)
    const next = results.filter((result) => done.has(result.email))
    for (const email of pending) {
      try {
        const invitation = await create.mutateAsync({ email, role, teamIds: [] })
        next.push({
          email,
          invitationId: invitation.id,
          isUndelivered:
            invitation.deliveryStatus === 'failed' || invitation.deliveryStatus === 'bounced',
        })
      } catch (error) {
        if (!isApiError(error)) throw error
        next.push({ email, error: getErrorMessage(error, tErrors) })
        if (error.code === LIMIT_REACHED) {
          setInviteError(getErrorMessage(error, tErrors))
          break
        }
      }
    }
    setResults(next)
    setIsSending(false)
  }

  const finish = async () => {
    setFinishError(undefined)
    const skippedSteps: SetupStep[] = models.isConnected ? [] : ['model']
    try {
      await complete.mutateAsync({ skippedSteps })
    } catch (error) {
      if (!isApiError(error)) throw error
      setFinishError(getErrorMessage(error, tErrors))
      return
    }
    router.push(toRoute(ROUTES.workspace.home(organization.slug)))
  }

  return {
    models,
    emailsText,
    onEmailsChange: setEmailsText,
    emailsError,
    inviteError,
    role,
    onRoleChange: (value: string) => {
      setRole(value as OrgRole)
    },
    results,
    pendingCount: Math.max(pending.length, 1),
    isSending,
    hasEmail,
    onInvite: (event: BaseSyntheticEvent) => {
      event.preventDefault()
      void send()
    },
    onCopyLink: (invitationId: string) => {
      link.mutate(invitationId, {
        onSuccess: (result) => {
          void navigator.clipboard
            .writeText(result.url)
            .then(() => toast.success(t('invite.linkCopied')))
        },
      })
    },
    finishError,
    isFinishing: complete.isPending,
    onFinish: () => {
      void finish()
    },
    t,
  }
}
