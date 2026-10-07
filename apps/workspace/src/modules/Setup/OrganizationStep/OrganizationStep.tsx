// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import { PasswordInput, PasswordStrength } from '@/modules/Auth'
import { Banner } from '@surefy/ui/components/Feedback'
import { Field, SelectInput } from '@surefy/ui/components/Forms'
import { Button } from '@surefy/ui/primitives/button'
import { Input } from '@surefy/ui/primitives/input'

import { useOrganizationStepController } from './OrganizationStep.controller'

import type { OrganizationStepProps } from './OrganizationStep.controller'

/**
 * Organization & owner (auth-and-setup.md §2): the organization's name and URL address, then the
 * Owner's name, work email, password and language. Submitting creates both and signs them in.
 */
export default function OrganizationStep(props: Readonly<OrganizationStepProps>) {
  const c = useOrganizationStepController(props)
  const { t } = c
  const tWizard = useTranslations('setup.wizard')

  return (
    <form noValidate onSubmit={c.onSubmit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-page-title">{t('title')}</h1>
        <p className="text-body text-muted-foreground">{t('description')}</p>
      </div>
      {c.formError && <Banner tone="destructive" title={c.formError} isAnnounced />}
      {props.requiresToken && (
        <Field label={t('token')} description={t('tokenHelp')} error={c.errors.token}>
          <Input
            type="password"
            autoComplete="off"
            spellCheck={false}
            {...c.form.register('token')}
          />
        </Field>
      )}
      <Field label={t('organizationName')} error={c.errors.organizationName}>
        <Input autoComplete="organization" autoFocus {...c.nameField} />
      </Field>
      <Field
        label={t('slug')}
        description={
          c.slugStatus === 'idle' && c.slug === '' ? undefined : (
            <span>
              {c.slug !== '' &&
                c.host !== '' &&
                t('slugPreview', { address: `${c.host}/${c.slug}` })}{' '}
              {c.slugStatus !== 'idle' && <span>{t(`slugStatus.${c.slugStatus}`)}</span>}
            </span>
          )
        }
        error={c.errors.slug}
      >
        <Input autoComplete="off" spellCheck={false} {...c.slugField} />
      </Field>
      <Field label={t('name')} error={c.errors.ownerName}>
        <Input autoComplete="name" {...c.form.register('ownerName')} />
      </Field>
      <Field label={t('email')} error={c.errors.email}>
        <Input type="email" autoComplete="email" {...c.form.register('email')} />
      </Field>
      <div className="flex flex-col gap-2">
        <Field label={t('password')} description={t('passwordHint')} error={c.errors.password}>
          <PasswordInput autoComplete="new-password" {...c.form.register('password')} />
        </Field>
        <PasswordStrength password={c.password} />
      </div>
      <Field label={t('language')}>
        <SelectInput
          options={c.localeOptions}
          value={c.locale}
          onValueChange={(value) => {
            c.form.setValue('locale', value)
          }}
        />
      </Field>
      <div className="flex items-center justify-between gap-3">
        <Button variant="secondary" type="button" onClick={props.onBack}>
          {tWizard('back')}
        </Button>
        <Button type="submit" isLoading={c.isPending}>
          {t('submit')}
        </Button>
      </div>
    </form>
  )
}
