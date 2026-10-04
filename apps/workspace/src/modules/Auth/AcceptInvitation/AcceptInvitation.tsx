// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import Link from 'next/link'

import { Banner } from '@surefy/ui/components/Feedback'
import { Field } from '@surefy/ui/components/Forms'
import { Button } from '@surefy/ui/primitives/button'
import { Input } from '@surefy/ui/primitives/input'

import AuthCard from '../AuthCard'
import PasswordInput from '../PasswordInput'
import PasswordStrength from '../PasswordStrength'
import { INVITATION_ERROR_STATE } from './AcceptInvitation.constants'
import { useAcceptInvitationController } from './AcceptInvitation.controller'

import type { AcceptInvitationProps } from './AcceptInvitation.types'

/** Accept an invitation: the link's state, the account form, or the accept button. */
export default function AcceptInvitation(props: Readonly<AcceptInvitationProps>) {
  const c = useAcceptInvitationController(props)
  const { t, invitation } = c

  if (c.errorState !== null || invitation === null) {
    const state = c.errorState ?? INVITATION_ERROR_STATE.NOT_FOUND
    const inviter = invitation?.inviterName ?? t('inviterFallback')
    const canReissue =
      state === INVITATION_ERROR_STATE.EXPIRED || state === INVITATION_ERROR_STATE.REVOKED
    return (
      <AuthCard title={t(`${state}.title`)} description={t(`${state}.description`, { inviter })}>
        {c.isReissueRequested ? (
          <Banner tone="success" title={t('reissue.sent', { inviter })} isAnnounced />
        ) : (
          canReissue && (
            <Button onClick={c.onRequestReissue} isLoading={c.isRequestingReissue}>
              {t('reissue.ask', { inviter })}
            </Button>
          )
        )}
        {state === INVITATION_ERROR_STATE.ACCEPTED && (
          <Button asChild>
            <Link href={c.signInHref}>{t('signIn')}</Link>
          </Button>
        )}
      </AuthCard>
    )
  }

  const heading = t('title', { organization: invitation.organization.name })
  const description = t('description', {
    organization: invitation.organization.name,
    role: t(`roles.${invitation.role}`),
    inviter: invitation.inviterName ?? t('inviterFallback'),
  })

  if (c.signedInAs !== null && !c.isMatchingAccount) {
    return (
      <AuthCard title={heading} description={description}>
        <Banner
          tone="warning"
          title={t('otherAccount.title', { email: c.signedInAs.email })}
          description={t('otherAccount.description', { email: invitation.email })}
        />
        <Button onClick={c.onSwitchAccount}>{t('otherAccount.switch')}</Button>
      </AuthCard>
    )
  }

  if (c.isMatchingAccount) {
    return (
      <AuthCard title={heading} description={description}>
        {c.acceptError && <Banner tone="destructive" title={c.acceptError} isAnnounced />}
        {c.needsTwoFactorSetup ? (
          <>
            <Banner
              tone="info"
              title={t('twoFactor.title')}
              description={t('twoFactor.description')}
            />
            <Button asChild>
              <Link href={c.twoFactorSetupHref}>{t('twoFactor.setUp')}</Link>
            </Button>
          </>
        ) : (
          <Button onClick={c.onAccept} isLoading={c.isAccepting}>
            {t('accept')}
          </Button>
        )}
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title={heading}
      description={description}
      footer={
        <p>
          {t('haveAccount')}{' '}
          <Link href={c.signInHref} className="text-primary underline-offset-4 hover:underline">
            {t('signIn')}
          </Link>
        </p>
      }
    >
      <form noValidate onSubmit={c.onSubmitAccount} className="flex flex-col gap-4">
        {c.formError && <Banner tone="destructive" title={c.formError} isAnnounced />}
        <Field label={t('email')}>
          <Input type="email" value={invitation.email} readOnly autoComplete="email" />
        </Field>
        <Field label={t('name')} error={c.nameError}>
          <Input autoComplete="name" autoFocus {...c.register('name')} />
        </Field>
        <div className="flex flex-col gap-2">
          <Field label={t('password')} description={t('passwordHint')} error={c.passwordError}>
            <PasswordInput autoComplete="new-password" {...c.register('password')} />
          </Field>
          <PasswordStrength password={c.password} />
        </div>
        <Button type="submit" isLoading={c.isCreating}>
          {t('createAccount')}
        </Button>
      </form>
    </AuthCard>
  )
}
