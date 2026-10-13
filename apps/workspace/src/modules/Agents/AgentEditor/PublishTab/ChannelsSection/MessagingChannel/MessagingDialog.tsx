// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Plus } from 'lucide-react'

import AddConnectionDialog from '@/modules/Settings/ConnectionsSettings/ConnectionDialogs/AddConnectionDialog'
import { Banner } from '@surefy/ui/components/Feedback'
import { Combobox, Field, FieldSet, SegmentedControl } from '@surefy/ui/components/Forms'
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
import { Textarea } from '@surefy/ui/primitives/textarea'

import { useMessagingDialogController } from './MessagingDialog.controller'

import type { MessagingDialogProps } from './MessagingChannel.types'

/** Set up or change a Slack or WhatsApp channel: the connection, and how the agent answers. */
export default function MessagingDialog(props: Readonly<MessagingDialogProps>) {
  const c = useMessagingDialogController(props)
  const { t, form } = c
  const { type, initial } = props
  const formId = `agent-${type}-channel-form`

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? t(`${type}.title`) : t(`${type}.titleNew`)}</DialogTitle>
          <DialogDescription>
            {props.exposure ? t(`${type}.exposes`, { names: props.exposure }) : t('exposesNothing')}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id={formId} noValidate onSubmit={c.onSubmit}>
            <DialogBody className="flex flex-col gap-4">
              {c.formError && <Banner tone="destructive" title={c.formError} isAnnounced />}
              <FormField
                control={form.control}
                name="connectionId"
                render={({ field, fieldState }) => (
                  <Field
                    label={t('connection.label')}
                    description={t(`${type}.connectionHelp`)}
                    error={fieldState.error?.message}
                  >
                    <Combobox
                      className="w-full"
                      options={c.connectionOptions}
                      labels={c.pickerLabels}
                      value={field.value}
                      onValueChange={field.onChange}
                      isLoading={c.isLoadingConnections}
                    />
                  </Field>
                )}
              />
              <div>
                <Button type="button" variant="ghost" size="sm" icon={Plus} onClick={c.onOpenAdd}>
                  {t('connection.add')}
                </Button>
              </div>
              {type === 'slack' && (
                <>
                  <FormField
                    control={form.control}
                    name="respondTo"
                    render={({ field }) => (
                      <FieldSet
                        legend={t('slack.respondTo.label')}
                        description={t('slack.respondTo.help')}
                      >
                        <SegmentedControl
                          label={t('slack.respondTo.label')}
                          options={c.respondToOptions}
                          value={field.value}
                          onValueChange={field.onChange}
                        />
                      </FieldSet>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="channelIds"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('slack.channels.label')}</FormLabel>
                        <FormControl>
                          <Textarea
                            rows={2}
                            placeholder="C0123456789"
                            className="font-mono"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>{t('slack.channels.help')}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}
              {type === 'whatsapp' && (
                <>
                  <FormField
                    control={form.control}
                    name="businessAccountId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('whatsapp.businessAccount.label')}</FormLabel>
                        <FormControl>
                          <Input autoComplete="off" maxLength={100} {...field} />
                        </FormControl>
                        <FormDescription>{t('whatsapp.businessAccount.help')}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="welcomeMessage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('whatsapp.welcome.label')}</FormLabel>
                        <FormControl>
                          <Textarea rows={2} maxLength={1000} {...field} />
                        </FormControl>
                        <FormDescription>{t('whatsapp.welcome.help')}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" type="button" onClick={props.onClose}>
                {t('cancel')}
              </Button>
              <Button type="submit" isLoading={c.isPending}>
                {initial ? t('save') : t('add')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
        {c.isAdding && (
          // The dialog is a portal inside this form: React would pass its submit on to it
          <div
            role="presentation"
            onSubmit={(event) => {
              event.stopPropagation()
            }}
          >
            <AddConnectionDialog
              orgId={c.orgId}
              canManage={c.canManageConnections}
              providerName={c.providerName}
              initialProviderKey={type}
              returnTo={c.returnTo}
              onConnected={c.onConnected}
              onClose={c.onCloseAdd}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
