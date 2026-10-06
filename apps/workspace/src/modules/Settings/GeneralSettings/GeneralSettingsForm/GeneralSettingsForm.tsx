// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import type { OrganizationDto } from '@surefy/contracts'
import { Banner } from '@surefy/ui/components/Feedback'
import { Combobox, SaveBar, SelectInput } from '@surefy/ui/components/Forms'
import { Section } from '@surefy/ui/components/Layout'
import { ConfirmDialog } from '@surefy/ui/components/Overlay'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@surefy/ui/primitives/form'
import { Input } from '@surefy/ui/primitives/input'

import { useGeneralSettingsFormController } from './GeneralSettingsForm.controller'

const FORM_ID = 'general-settings-form'

export default function GeneralSettingsForm({
  organization,
}: Readonly<{ organization: OrganizationDto }>) {
  const c = useGeneralSettingsFormController({ organization })
  const { t, form } = c

  return (
    <>
      <Form {...form}>
        <form id={FORM_ID} noValidate onSubmit={c.onSubmit} className="flex flex-col gap-6">
          {c.formError && <Banner tone="destructive" title={c.formError} isAnnounced />}
          <Section title={t('organization.title')}>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('name')}</FormLabel>
                    <FormControl>
                      <Input autoComplete="organization" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('slug')}</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" spellCheck={false} {...field} />
                    </FormControl>
                    <FormDescription>
                      {c.slugStatus === 'idle'
                        ? t('slugHelp', { days: c.slugConfirm.redirectDays })
                        : t(`slugStatus.${c.slugStatus}`)}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </Section>
          <Section title={t('region.title')}>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="timezone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('timezone')}</FormLabel>
                    <FormControl>
                      <Combobox
                        options={c.timeZoneOptions}
                        value={field.value}
                        onValueChange={(value) => {
                          field.onChange(value ?? '')
                        }}
                        labels={{
                          placeholder: t('timezonePlaceholder'),
                          search: t('timezoneSearch'),
                          empty: t('timezoneEmpty'),
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="defaultLocale"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('language')}</FormLabel>
                    <FormControl>
                      <SelectInput
                        options={c.localeOptions}
                        value={field.value}
                        onValueChange={field.onChange}
                      />
                    </FormControl>
                    <FormDescription>{t('languageHelp')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </Section>
        </form>
      </Form>
      <SaveBar
        formId={FORM_ID}
        isDirty={c.isDirty}
        isSaving={c.isSaving}
        onDiscard={c.onDiscard}
        labels={{
          message: t('unsaved', { count: c.changeCount }),
          discard: t('discard'),
          save: t('save'),
        }}
      />
      <ConfirmDialog
        open={c.slugConfirm.open}
        onOpenChange={c.slugConfirm.onOpenChange}
        tier="T2"
        title={t('slugConfirm.title', { slug: c.slugConfirm.newSlug })}
        description={t('slugConfirm.description', { days: c.slugConfirm.redirectDays })}
        impact={[t('slugConfirm.impact')]}
        labels={{ confirm: t('slugConfirm.confirm') }}
        onConfirm={c.slugConfirm.onConfirm}
      />
    </>
  )
}
