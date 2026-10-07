// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import type { UserDto } from '@surefy/contracts'
import { StatusPill } from '@surefy/ui/components/DataDisplay'
import { Field } from '@surefy/ui/components/Forms'
import { Section } from '@surefy/ui/components/Layout'
import { Button } from '@surefy/ui/primitives/button'
import { Input } from '@surefy/ui/primitives/input'

import { useProfileDetailsController } from './ProfileDetails.controller'
import UserAvatar from '../../UserAvatar'

/** Name (editable) and email (changed through sign-in settings, shown read-only). */
export default function ProfileDetails({ user }: Readonly<{ user: UserDto }>) {
  const { register, nameError, isDirty, isPending, onSubmit, email, isEmailVerified, t } =
    useProfileDetailsController({ user })

  return (
    <Section title={t('title')}>
      <form
        noValidate
        onSubmit={onSubmit}
        className="flex flex-col gap-4 md:flex-row md:items-start md:gap-5"
      >
        <UserAvatar user={user} size="lg" />
        <div className="grid min-w-0 flex-1 gap-4 md:grid-cols-2">
          <Field label={t('name')} error={nameError}>
            <Input autoComplete="name" {...register('name')} />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-label">{t('email')}</span>
            <span className="border-border bg-surface-2 text-body text-foreground-secondary flex h-9 items-center gap-2 rounded-lg border px-3">
              <span className="truncate">{email}</span>
              <StatusPill
                tone={isEmailVerified ? 'success' : 'warning'}
                label={isEmailVerified ? t('verified') : t('notVerified')}
              />
            </span>
          </div>
          <Button
            type="submit"
            isLoading={isPending}
            aria-disabled={!isDirty}
            className="self-start md:col-span-2 md:justify-self-start"
          >
            {t('save')}
          </Button>
        </div>
      </form>
    </Section>
  )
}
