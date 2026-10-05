// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import type { OrganizationDto } from '@surefy/contracts'
import { Banner } from '@surefy/ui/components/Feedback'
import { SaveBar, SelectInput, SwitchField } from '@surefy/ui/components/Forms'
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

import { useSecurityFormController } from './SecurityForm.controller'

const FORM_ID = 'security-settings-form'

export default function SecurityForm({
  organization,
}: Readonly<{ organization: OrganizationDto }>) {
  const c = useSecurityFormController({ organization })
  const { t, form } = c

  return (
    <>
      <Form {...form}>
        <form
          id={FORM_ID}
          noValidate
          onSubmit={c.onSubmit}
          className="flex max-w-xl flex-col gap-6"
        >
          {c.formError && <Banner tone="destructive" title={c.formError} isAnnounced />}
          <Section title={t('signIn.title')}>
            <div className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="require2fa"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <SwitchField
                        label={t('require2fa.label')}
                        description={t('require2fa.description')}
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sessionLength"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('sessionLength.label')}</FormLabel>
                    <FormControl>
                      <SelectInput
                        options={c.sessionOptions}
                        value={field.value}
                        onValueChange={field.onChange}
                      />
                    </FormControl>
                    <FormDescription>{t('sessionLength.help')}</FormDescription>
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
        open={c.confirm.open}
        onOpenChange={c.confirm.onOpenChange}
        tier="T2"
        title={t('require2fa.confirmTitle')}
        description={t('require2fa.confirmDescription')}
        impact={[
          c.confirm.isCounting
            ? t('require2fa.counting')
            : t('require2fa.impact', { count: c.confirm.withoutTwoFactor }),
        ]}
        labels={{ confirm: t('require2fa.confirm') }}
        onConfirm={c.confirm.onConfirm}
      />
    </>
  )
}
