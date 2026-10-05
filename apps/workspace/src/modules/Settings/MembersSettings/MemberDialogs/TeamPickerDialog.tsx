// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useInfiniteQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { useBulkMemberActionMutation, useUpdateMemberMutation } from '@/api/members'
import { teamQueries } from '@/api/teams'
import type { MemberDto } from '@surefy/contracts'
import { toast, Banner } from '@surefy/ui/components/Feedback'
import { Field, SelectInput } from '@surefy/ui/components/Forms'
import { Button } from '@surefy/ui/primitives/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@surefy/ui/primitives/dialog'
import { getErrorMessage } from '@surefy/web-core/errors'

const TEAMS_LIMIT = 100

type TeamPickerDialogProps = Readonly<
  { orgId: string; onClose: () => void } & (
    { mode: 'primary'; member: MemberDto } | { mode: 'bulk'; memberIds: string[] }
  )
>

/**
 * Two small pickers in one dialog: a person's primary team (one of their teams, T0) and "Add to
 * team" for the selected people.
 */
export default function TeamPickerDialog(props: TeamPickerDialogProps) {
  const t = useTranslations('settings.members.teamPicker')
  const tErrors = useTranslations('errors')
  const { orgId, onClose } = props
  const update = useUpdateMemberMutation(orgId, { silent: true })
  const bulk = useBulkMemberActionMutation(orgId, { silent: true })
  const teams = useInfiniteQuery({
    ...teamQueries.list(orgId, { limit: TEAMS_LIMIT }),
    enabled: props.mode === 'bulk',
  })
  const options =
    props.mode === 'primary'
      ? props.member.teams.map((team) => ({ value: team.id, label: team.name }))
      : (teams.data?.pages.flatMap((page) => page.items) ?? []).map((team) => ({
          value: team.id,
          label: team.name,
        }))
  const [teamId, setTeamId] = useState<string | undefined>(
    props.mode === 'primary' ? (props.member.primaryTeamId ?? undefined) : undefined,
  )
  const mutation = props.mode === 'primary' ? update : bulk

  const onConfirm = () => {
    if (!teamId) return
    if (props.mode === 'primary') {
      update.mutate(
        { memberId: props.member.id, primaryTeamId: teamId },
        {
          onSuccess: () => {
            toast.success(t('primarySaved', { name: props.member.user.name }))
            onClose()
          },
        },
      )
      return
    }
    bulk.mutate(
      { action: 'add-to-team', memberIds: props.memberIds, teamId },
      {
        onSuccess: (result) => {
          toast.success(t('bulkSaved', { count: result.affected, skipped: result.skipped.length }))
          onClose()
        },
      },
    )
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {props.mode === 'primary'
              ? t('primaryTitle', { name: props.member.user.name })
              : t('bulkTitle', { count: props.memberIds.length })}
          </DialogTitle>
          <DialogDescription>
            {props.mode === 'primary' ? t('primaryDescription') : t('bulkDescription')}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          {mutation.error && (
            <Banner
              tone="destructive"
              title={getErrorMessage(mutation.error, tErrors)}
              isAnnounced
            />
          )}
          <Field label={t('team')}>
            <SelectInput
              options={options}
              value={teamId}
              onValueChange={setTeamId}
              placeholder={t('placeholder')}
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button isLoading={mutation.isPending} aria-disabled={!teamId} onClick={onConfirm}>
            {props.mode === 'primary' ? t('primaryConfirm') : t('bulkConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
