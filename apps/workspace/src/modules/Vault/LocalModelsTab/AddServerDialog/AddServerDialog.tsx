// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Banner } from '@surefy/ui/components/Feedback'
import { SecretInput, SegmentedControl, SelectInput } from '@surefy/ui/components/Forms'
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

import { useAddServerController } from './AddServerDialog.controller'
import ConnectionTestResult from '../../ConnectionTestResult'
import { KEY_SCOPE } from '../../Vault.constants'

const FORM_ID = 'add-server-form'

/** Add local server (vault.md §1): type, address and optional key, Test connection, detected models. */
export default function AddServerDialog(props: Readonly<{ orgId: string; onClose: () => void }>) {
  const c = useAddServerController(props)
  const { t } = c
  const scope = c.form.watch('scope')

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
                    <FormLabel>{t('type')}</FormLabel>
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
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={c.form.control}
                name="baseUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('baseUrl')}</FormLabel>
                    <FormControl>
                      <Input
                        autoComplete="off"
                        inputMode="url"
                        placeholder={t('baseUrlPlaceholder')}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>{t('baseUrlHelp')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={c.form.control}
                name="secret"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('secret')} <span className="text-muted-foreground">({t('optional')})</span>
                    </FormLabel>
                    <FormControl>
                      <SecretInput
                        autoComplete="off"
                        labels={{ show: t('show'), hide: t('hide') }}
                        action={
                          <Button
                            type="button"
                            variant="secondary"
                            isLoading={c.isTesting}
                            onClick={c.onTest}
                          >
                            {t('testConnection')}
                          </Button>
                        }
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {c.testResult && <ConnectionTestResult result={c.testResult} />}
              <FormField
                control={c.form.control}
                name="scope"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('scope')}</FormLabel>
                    <FormControl>
                      <SegmentedControl
                        label={t('scope')}
                        options={[
                          { value: KEY_SCOPE.ORGANIZATION, label: t('scopeOrganization') },
                          { value: KEY_SCOPE.TEAM, label: t('scopeTeam') },
                        ]}
                        value={field.value}
                        onValueChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {scope === KEY_SCOPE.TEAM && (
                <FormField
                  control={c.form.control}
                  name="teamId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('team')}</FormLabel>
                      <FormControl>
                        <SelectInput
                          options={c.teams}
                          value={field.value || undefined}
                          onValueChange={field.onChange}
                          placeholder={t('teamPlaceholder')}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
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
