// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import Link from 'next/link'

import { ROUTES, SETTINGS_SECTION } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import { Banner } from '@surefy/ui/components/Feedback'
import { Field } from '@surefy/ui/components/Forms'
import { Button } from '@surefy/ui/primitives/button'
import { Label } from '@surefy/ui/primitives/label'
import { RadioGroup, RadioGroupItem } from '@surefy/ui/primitives/radio-group'
import { Textarea } from '@surefy/ui/primitives/textarea'

import { INVITE_ROLES } from '../Setup.constants'
import { useReadyStepController } from './ReadyStep.controller'

import type { ReadyStepProps } from './ReadyStep.controller'

/**
 * Ready (auth-and-setup.md §2): what was chosen with a "Change" link each, invitations by email or
 * link with a role, and the way into Chat. The setup checklist then waits on the home screen.
 */
export default function ReadyStep(props: Readonly<ReadyStepProps>) {
  const c = useReadyStepController(props)
  const { t, models } = c
  const { organization } = props

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-page-title">{t('title')}</h1>
        <p className="text-body text-muted-foreground">{t('description')}</p>
      </div>
      <dl aria-label={t('summaryLabel')} className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <dt className="text-caption text-muted-foreground">{t('summary.organization')}</dt>
            <dd className="text-body font-medium">
              {t('summary.organizationValue', { name: organization.name, slug: organization.slug })}
            </dd>
          </div>
          <Button variant="link" size="sm" asChild>
            <Link
              href={toRoute(ROUTES.workspace.settings(organization.slug, SETTINGS_SECTION.GENERAL))}
              aria-label={t('summary.changeLabel', { item: t('summary.organization') })}
            >
              {t('summary.change')}
            </Link>
          </Button>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <dt className="text-caption text-muted-foreground">{t('summary.model')}</dt>
            <dd className="text-body font-medium">
              {models.isConnected
                ? t('summary.modelConnected', { count: models.modelCount })
                : t('summary.modelSkipped')}
            </dd>
          </div>
          <Button
            variant="link"
            size="sm"
            aria-label={t('summary.changeLabel', { item: t('summary.model') })}
            onClick={props.onChangeModel}
          >
            {t('summary.change')}
          </Button>
        </div>
        <div>
          <dt className="text-caption text-muted-foreground">{t('summary.email')}</dt>
          <dd className="text-body font-medium">
            {c.hasEmail ? t('summary.emailOn') : t('summary.emailOff')}
          </dd>
        </div>
      </dl>
      <form noValidate onSubmit={c.onInvite} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-section-title">{t('invite.title')}</h2>
          <p className="text-caption text-muted-foreground">
            {c.hasEmail ? t('invite.description') : t('invite.noEmail')}
          </p>
        </div>
        {c.inviteError && <Banner tone="destructive" title={c.inviteError} isAnnounced />}
        <Field
          label={t('invite.emails')}
          description={t('invite.emailsHelp')}
          error={c.emailsError}
        >
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
          <legend className="text-label mb-1">{t('invite.role')}</legend>
          <RadioGroup value={c.role} onValueChange={c.onRoleChange}>
            {INVITE_ROLES.map((role) => (
              <div key={role} className="flex items-start gap-2">
                <RadioGroupItem id={`setup-invite-role-${role}`} value={role} />
                <Label htmlFor={`setup-invite-role-${role}`} className="flex flex-col gap-0.5">
                  <span className="font-medium">{t(`invite.roles.${role}.name`)}</span>
                  <span className="text-caption text-muted-foreground font-normal">
                    {t(`invite.roles.${role}.description`)}
                  </span>
                </Label>
              </div>
            ))}
          </RadioGroup>
        </fieldset>
        {c.results.length > 0 && (
          <ul className="flex flex-col gap-2" aria-label={t('invite.results')}>
            {c.results.map((result) => (
              <li key={result.email} className="text-body flex flex-wrap items-center gap-2">
                <span className="font-medium">{result.email}</span>
                <span className={result.error ? 'text-destructive' : 'text-muted-foreground'}>
                  {result.error ??
                    (result.isUndelivered ? t('invite.undelivered') : t('invite.sent'))}
                </span>
                {result.invitationId && (result.isUndelivered === true || !c.hasEmail) && (
                  <Button
                    variant="link"
                    size="sm"
                    type="button"
                    onClick={() => {
                      c.onCopyLink(result.invitationId ?? '')
                    }}
                  >
                    {t('invite.copyLink')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        <Button variant="secondary" type="submit" className="self-start" isLoading={c.isSending}>
          {c.hasEmail
            ? t('invite.submit', { count: c.pendingCount })
            : t('invite.submitLinks', { count: c.pendingCount })}
        </Button>
      </form>
      {c.finishError && <Banner tone="destructive" title={c.finishError} isAnnounced />}
      <div className="flex items-center justify-between gap-3">
        <p className="text-caption text-muted-foreground">{t('checklist')}</p>
        <Button isLoading={c.isFinishing} onClick={c.onFinish}>
          {t('open')}
        </Button>
      </div>
    </div>
  )
}
