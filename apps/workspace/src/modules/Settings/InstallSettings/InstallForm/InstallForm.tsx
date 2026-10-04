// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import type { InstallSettingsDto } from '@surefy/contracts'
import { Banner } from '@surefy/ui/components/Feedback'
import { SaveBar, SelectInput, SwitchField } from '@surefy/ui/components/Forms'
import { Section } from '@surefy/ui/components/Layout'
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

import { useInstallFormController } from './InstallForm.controller'

const FORM_ID = 'install-settings-form'

/** Who can sign in and sign up, how, and the web search address. */
export default function InstallForm({ settings }: Readonly<{ settings: InstallSettingsDto }>) {
  const c = useInstallFormController({ settings })
  const { t, form } = c

  return (
    <>
      <Form {...form}>
        <form id={FORM_ID} noValidate onSubmit={c.onSubmit} className="flex flex-col gap-6">
          {c.formError && <Banner tone="destructive" title={c.formError} isAnnounced />}
          <Section title={t('signIn.title')} description={t('signIn.description')}>
            <div className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="emailPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <SwitchField
                        label={t('signIn.emailPassword')}
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              {c.providers.map(({ provider, isConfigured }) => (
                <FormField
                  key={provider}
                  control={form.control}
                  name={provider}
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <SwitchField
                          label={t(`signIn.providers.${provider}`)}
                          description={isConfigured ? undefined : t('signIn.notConfigured')}
                          checked={field.value}
                          disabled={!isConfigured}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              ))}
            </div>
          </Section>
          <Section title={t('access.title')}>
            <div className="flex max-w-xl flex-col gap-4">
              <FormField
                control={form.control}
                name="signupPolicy"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('signupPolicy.label')}</FormLabel>
                    <FormControl>
                      <SelectInput
                        options={c.signupOptions}
                        value={field.value}
                        onValueChange={field.onChange}
                      />
                    </FormControl>
                    <FormDescription>{t('signupPolicy.help')}</FormDescription>
                  </FormItem>
                )}
              />
              {c.canSetCreationPolicy && (
                <FormField
                  control={form.control}
                  name="orgCreationPolicy"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('orgCreationPolicy.label')}</FormLabel>
                      <FormControl>
                        <SelectInput
                          options={c.creationOptions}
                          value={field.value}
                          onValueChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              )}
            </div>
          </Section>
          <Section title={t('webSearch.title')}>
            <FormField
              control={form.control}
              name="searxngUrl"
              render={({ field }) => (
                <FormItem className="max-w-xl">
                  <FormLabel>{t('webSearch.label')}</FormLabel>
                  <FormControl>
                    <Input type="url" autoComplete="off" spellCheck={false} {...field} />
                  </FormControl>
                  <FormDescription>{t('webSearch.help')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
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
    </>
  )
}
