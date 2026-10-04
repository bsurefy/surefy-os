// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import type { InstallSettingsDto } from '@surefy/contracts'
import { Banner } from '@surefy/ui/components/Feedback'
import { SecretInput, SwitchField } from '@surefy/ui/components/Forms'
import { Section } from '@surefy/ui/components/Layout'
import { Button } from '@surefy/ui/primitives/button'
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

import { useSmtpSectionController } from './SmtpSection.controller'

const TEXT_FIELDS = ['host', 'port', 'username', 'fromAddress', 'fromName'] as const

/** Email server (SMTP): the settings, "Send test email", and switching email off. */
export default function SmtpSection({ settings }: Readonly<{ settings: InstallSettingsDto }>) {
  const c = useSmtpSectionController({ settings })
  const { t, form, testForm } = c

  return (
    <Section title={t('title')} description={t('description')}>
      <Form {...form}>
        <form noValidate onSubmit={c.onSubmit} className="flex max-w-xl flex-col gap-4">
          {c.formError && <Banner tone="destructive" title={c.formError} isAnnounced />}
          {TEXT_FIELDS.map((name) => (
            <FormField
              key={name}
              control={form.control}
              name={name}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t(`fields.${name}`)}</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="off"
                      spellCheck={false}
                      inputMode={name === 'port' ? 'numeric' : undefined}
                      type={name === 'fromAddress' ? 'email' : 'text'}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('fields.password')}</FormLabel>
                <FormControl>
                  <SecretInput
                    labels={{ show: t('showPassword'), hide: t('hidePassword') }}
                    placeholder={c.isPasswordSet ? t('passwordSaved') : undefined}
                    {...field}
                  />
                </FormControl>
                <FormDescription>{t('passwordHelp')}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="secure"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <SwitchField
                    label={t('fields.secure')}
                    description={t('secureHelp')}
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <div className="flex gap-2">
            <Button type="submit" isLoading={c.isSaving}>
              {t('save')}
            </Button>
            {c.isConfigured && (
              <Button type="button" variant="destructive-ghost" onClick={c.onSwitchOff}>
                {t('switchOff')}
              </Button>
            )}
          </div>
        </form>
      </Form>
      {c.isConfigured && (
        <Form {...testForm}>
          <form noValidate onSubmit={c.onSubmitTest} className="flex max-w-xl flex-col gap-2">
            <h3 className="text-section-title">{t('test.title')}</h3>
            {c.testError && <Banner tone="destructive" title={c.testError} isAnnounced />}
            {c.isTestSent && <Banner tone="success" title={t('test.sent')} isAnnounced />}
            <FormField
              control={testForm.control}
              name="to"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('test.to')}</FormLabel>
                  <FormControl>
                    <Input type="email" autoComplete="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              variant="secondary"
              className="self-start"
              isLoading={c.isTesting}
            >
              {t('test.send')}
            </Button>
          </form>
        </Form>
      )}
    </Section>
  )
}
