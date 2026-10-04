// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import type { UserDto } from '@surefy/contracts'
import { StatusPill } from '@surefy/ui/components/DataDisplay'
import { Field } from '@surefy/ui/components/Forms'
import { Section } from '@surefy/ui/components/Layout'
import { Button } from '@surefy/ui/primitives/button'
import { Input } from '@surefy/ui/primitives/input'

import { useProfileDetailsController } from './ProfileDetails.controller'

/** Name (editable) and email (changed through sign-in settings, shown read-only). */
export default function ProfileDetails({ user }: Readonly<{ user: UserDto }>) {
  const { register, nameError, isDirty, isPending, onSubmit, email, isEmailVerified, t } =
    useProfileDetailsController({ user })

  return (
    <Section title={t('title')}>
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label={t('name')} error={nameError}>
          <Input autoComplete="name" {...register('name')} />
        </Field>
        <div className="flex flex-col gap-1">
          <span className="text-label">{t('email')}</span>
          <span className="text-body flex flex-wrap items-center gap-2">
            {email}
            <StatusPill
              tone={isEmailVerified ? 'success' : 'warning'}
              label={isEmailVerified ? t('verified') : t('notVerified')}
            />
          </span>
        </div>
        <Button type="submit" isLoading={isPending} aria-disabled={!isDirty} className="self-start">
          {t('save')}
        </Button>
      </form>
    </Section>
  )
}
