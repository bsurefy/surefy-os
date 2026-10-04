// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { useCreateInvitationLinkMutation, useCreateInvitationMutation } from '@/api/members'
import { teamQueries } from '@/api/teams'
import type { OrgRole } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { INVITE_EMAILS_MAX } from '../MembersSettings.constants'
import { parseEmails } from '../MembersSettings.utils'

import type { InviteMembersDialogProps, InviteResult } from './MemberDialogs.types'
import type { BaseSyntheticEvent } from 'react'

const TEAMS_LIMIT = 100
// Stops after the first answer that no other address can fix: the seat limit applies to all of them.
const LIMIT_REACHED = 'LIMIT_REACHED'

export function useInviteMembersController({ orgId }: InviteMembersDialogProps) {
  const t = useTranslations('settings.members.invite')
  const tErrors = useTranslations('errors')
  const create = useCreateInvitationMutation(orgId, { silent: true })
  const link = useCreateInvitationLinkMutation(orgId)
  const teams = useInfiniteQuery(teamQueries.list(orgId, { limit: TEAMS_LIMIT }))
  const [emailsText, setEmailsText] = useState('')
  const [role, setRole] = useState<OrgRole>('user')
  const [teamIds, setTeamIds] = useState<string[]>([])
  const [results, setResults] = useState<InviteResult[]>([])
  const [emailsError, setEmailsError] = useState<string | undefined>()
  const [formError, setFormError] = useState<string | undefined>()
  const [isSending, setIsSending] = useState(false)

  const emails = parseEmails(emailsText)
  const failed = new Set(results.filter((result) => result.error).map((result) => result.email))
  const done = new Set(results.filter((result) => !result.error).map((result) => result.email))
  const pending = emails.filter((email) => !done.has(email))

  const send = async () => {
    setEmailsError(undefined)
    setFormError(undefined)
    if (pending.length === 0) {
      setEmailsError(t('emailsRequired'))
      return
    }
    if (pending.length > INVITE_EMAILS_MAX) {
      setEmailsError(t('emailsTooMany', { max: INVITE_EMAILS_MAX }))
      return
    }
    setIsSending(true)
    const next: InviteResult[] = results.filter((result) => done.has(result.email))
    for (const email of pending) {
      try {
        const invitation = await create.mutateAsync({ email, role, teamIds })
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
          setFormError(getErrorMessage(error, tErrors))
          break
        }
      }
    }
    setResults(next)
    setIsSending(false)
  }

  return {
    emailsText,
    onEmailsChange: setEmailsText,
    emailsError,
    formError,
    role,
    onRoleChange: (value: string) => {
      setRole(value as OrgRole)
    },
    teamIds,
    onTeamIdsChange: setTeamIds,
    teamOptions: (teams.data?.pages.flatMap((page) => page.items) ?? []).map((team) => ({
      value: team.id,
      label: team.name,
    })),
    results,
    hasFailures: failed.size > 0,
    pendingCount: Math.max(pending.length, 1),
    isSending,
    onSubmit: (event: BaseSyntheticEvent) => {
      event.preventDefault()
      void send()
    },
    onCopyLink: (invitationId: string) => {
      link.mutate(invitationId, {
        onSuccess: (result) => {
          void navigator.clipboard.writeText(result.url).then(() => toast.success(t('linkCopied')))
        },
      })
    },
  }
}
