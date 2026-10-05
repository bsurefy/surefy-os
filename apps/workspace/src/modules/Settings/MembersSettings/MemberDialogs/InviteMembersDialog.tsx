// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import { Banner } from '@surefy/ui/components/Feedback'
import { Field, MultiSelect } from '@surefy/ui/components/Forms'
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
import { Label } from '@surefy/ui/primitives/label'
import { RadioGroup, RadioGroupItem } from '@surefy/ui/primitives/radio-group'
import { Textarea } from '@surefy/ui/primitives/textarea'

import { ASSIGNABLE_ROLES } from '../MembersSettings.constants'
import { useInviteMembersController } from './InviteMembersDialog.controller'

import type { InviteMembersDialogProps } from './MemberDialogs.types'

/**
 * Invite: emails (one request each), a role with what it can do, and teams. Failures stay in the
 * dialog per address; an address that was not delivered offers its invite link.
 */
export default function InviteMembersDialog(props: Readonly<InviteMembersDialogProps>) {
  const c = useInviteMembersController(props)
  const t = useTranslations('settings.members.invite')

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <form id="invite-members-form" noValidate onSubmit={c.onSubmit}>
          <DialogBody className="flex flex-col gap-4">
            {c.formError && <Banner tone="destructive" title={c.formError} isAnnounced />}
            <Field label={t('emails')} description={t('emailsHelp')} error={c.emailsError}>
              <Textarea
                rows={3}
                autoComplete="off"
                spellCheck={false}
                value={c.emailsText}
                onChange={(event) => {
                  c.onEmailsChange(event.target.value)
                }}
              />
            </Field>
            <fieldset className="flex flex-col gap-2">
              <legend className="text-label mb-1">{t('role')}</legend>
              <RadioGroup value={c.role} onValueChange={c.onRoleChange}>
                {ASSIGNABLE_ROLES.map((role) => (
                  <div key={role} className="flex items-start gap-2">
                    <RadioGroupItem
                      id={`invite-role-${role}`}
                      value={role}
                      disabled={role === 'owner' && !props.canManageAdmins}
                    />
                    <Label htmlFor={`invite-role-${role}`} className="flex flex-col gap-0.5">
                      <span className="font-medium">{t(`roles.${role}.name`)}</span>
                      <span className="text-caption text-muted-foreground font-normal">
                        {t(`roles.${role}.description`)}
                      </span>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </fieldset>
            <Field label={t('teams')} optionalLabel={t('optional')}>
              <MultiSelect
                options={c.teamOptions}
                value={c.teamIds}
                onValueChange={c.onTeamIdsChange}
                labels={{
                  placeholder: t('teamsPlaceholder'),
                  search: t('teamsSearch'),
                  empty: t('teamsEmpty'),
                  remove: (label) => t('removeTeam', { label }),
                  more: (count) => t('moreTeams', { count }),
                }}
              />
            </Field>
            {c.results.length > 0 && (
              <ul className="flex flex-col gap-2" aria-label={t('results')}>
                {c.results.map((result) => (
                  <li key={result.email} className="text-body flex flex-wrap items-center gap-2">
                    <span className="font-medium">{result.email}</span>
                    <span className={result.error ? 'text-destructive' : 'text-muted-foreground'}>
                      {result.error ?? t('sent')}
                    </span>
                    {result.invitationId && result.isUndelivered && (
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => {
                          c.onCopyLink(result.invitationId ?? '')
                        }}
                      >
                        {t('copyLink')}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" type="button" onClick={props.onClose}>
              {c.results.length > 0 && !c.hasFailures ? t('close') : t('cancel')}
            </Button>
            <Button type="submit" isLoading={c.isSending}>
              {t('submit', { count: c.pendingCount })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
