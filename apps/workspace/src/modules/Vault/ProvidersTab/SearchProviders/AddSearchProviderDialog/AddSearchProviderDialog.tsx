// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Banner } from '@surefy/ui/components/Feedback'
import { SecretInput, SelectInput } from '@surefy/ui/components/Forms'
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

import { useAddSearchProviderController } from './AddSearchProviderDialog.controller'
import ConnectionTestResult from '../../../ConnectionTestResult'

import type { AddSearchProviderDialogProps } from './AddSearchProviderDialog.controller'

const FORM_ID = 'add-search-provider-form'

/**
 * Add search provider: provider → label → SearXNG address or Brave and Tavily key → Test
 * connection (required) → Save. Search providers always belong to the whole organization.
 */
export default function AddSearchProviderDialog(props: Readonly<AddSearchProviderDialogProps>) {
  const c = useAddSearchProviderController(props)
  const { t } = c
  const testButton = (
    <Button type="button" variant="secondary" isLoading={c.isTesting} onClick={c.onTest}>
      {t('testConnection')}
    </Button>
  )

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
        <Form {...c.form}>
          <form id={FORM_ID} noValidate onSubmit={c.onSubmit}>
            <DialogBody className="flex flex-col gap-4">
              {c.formError && <Banner tone="destructive" title={c.formError} isAnnounced />}
              <FormField
                control={c.form.control}
                name="providerKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('provider')}</FormLabel>
                    <FormControl>
                      <SelectInput
                        options={c.providerOptions}
                        value={field.value}
                        onValueChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={c.form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('name')}</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" {...field} />
                    </FormControl>
                    <FormDescription>{t('nameHelp')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {c.needsAddress ? (
                <FormField
                  control={c.form.control}
                  name="baseUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('baseUrl')}</FormLabel>
                      <div className="flex items-start gap-2">
                        <FormControl>
                          <Input autoComplete="off" inputMode="url" {...field} />
                        </FormControl>
                        {testButton}
                      </div>
                      <FormDescription>{t('baseUrlHelp')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <FormField
                  control={c.form.control}
                  name="secret"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('secret')}</FormLabel>
                      <FormControl>
                        <SecretInput
                          autoComplete="off"
                          labels={{ show: t('show'), hide: t('hide') }}
                          action={testButton}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>{t('secretHelp')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              {c.testResult && <ConnectionTestResult result={c.testResult} />}
              {!c.needsAddress && (
                <FormField
                  control={c.form.control}
                  name="expiresAt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t('expiresAt')}{' '}
                        <span className="text-muted-foreground">({t('optional')})</span>
                      </FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormDescription>{t('expiresAtHelp')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <p className="text-caption text-muted-foreground">{t('privacyNote')}</p>
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" type="button" onClick={props.onClose}>
                {t('cancel')}
              </Button>
              <Button type="submit" isLoading={c.isPending} disabled={!c.canSave}>
                {t('save')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
