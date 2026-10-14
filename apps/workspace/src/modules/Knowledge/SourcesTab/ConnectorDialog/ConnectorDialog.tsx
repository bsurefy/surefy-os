// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Plus } from 'lucide-react'

import AddConnectionDialog from '@/modules/Settings/ConnectionsSettings/ConnectionDialogs/AddConnectionDialog'
import ReconnectDialog from '@/modules/Settings/ConnectionsSettings/ConnectionDialogs/ReconnectDialog'
import type {
  KnowledgeBaseDto,
  KnowledgeConnectorProvider,
  KnowledgeSourceDto,
} from '@surefy/contracts'
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@surefy/ui/primitives/form'
import { Input } from '@surefy/ui/primitives/input'

import { useConnectorDialogController } from './ConnectorDialog.controller'
import FolderPicker from './FolderPicker'

/**
 * Connect Google Drive or Notion to a knowledge base: pick the account, the folders or pages to
 * sync and how often; or, for an existing connector source, change its folders and schedule.
 */
export default function ConnectorDialog(
  props: Readonly<{
    orgId: string
    base: KnowledgeBaseDto
    provider: KnowledgeConnectorProvider
    /** Changes this connector source instead of adding one. */
    source?: KnowledgeSourceDto
    onClose: () => void
  }>,
) {
  const c = useConnectorDialogController(props)
  const { t, form } = c
  const { provider } = props
  const connectionId = form.watch('connectionId')
  const account = c.connection?.externalAccountLabel ?? c.connection?.name ?? ''

  const expired = (
    <Banner
      tone="warning"
      title={t('expired.title', { account: account || c.appName })}
      description={t('expired.description')}
      action={
        c.canReconnect ? (
          <Button type="button" variant="secondary" size="sm" onClick={c.onReconnect}>
            {t('expired.reconnect')}
          </Button>
        ) : (
          <span className="text-caption">
            {t('expired.ask', { name: c.connection?.connectedBy?.name ?? t('expired.someone') })}
          </span>
        )
      }
    />
  )

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {c.isEditing
              ? t('editTitle', { name: props.source?.name ?? '' })
              : t('title', { app: c.appName })}
          </DialogTitle>
          <DialogDescription>{t(`description.${provider}`)}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form noValidate onSubmit={c.onSubmit}>
            <DialogBody className="flex flex-col gap-4">
              {c.formError && <Banner tone="destructive" title={c.formError} isAnnounced />}
              {c.isEditing ? (
                <div className="flex flex-col gap-0.5">
                  <span className="text-label">{t('account.label')}</span>
                  <span className="text-body text-muted-foreground">
                    {account || t('account.notListed')}
                  </span>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <FormField
                    control={form.control}
                    name="connectionId"
                    render={({ field, fieldState }) => (
                      <Field
                        label={t('account.label')}
                        description={t('account.help', { app: c.appName })}
                        error={fieldState.error?.message}
                      >
                        <Combobox
                          className="w-full"
                          options={c.accountOptions}
                          labels={c.accountLabels}
                          value={field.value}
                          onValueChange={c.onAccountChange}
                          isLoading={c.isLoadingAccounts}
                        />
                      </Field>
                    )}
                  />
                  <div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      icon={Plus}
                      onClick={c.onOpenAdd}
                    >
                      {t('account.add', { app: c.appName })}
                    </Button>
                  </div>
                </div>
              )}
              {connectionId &&
                (c.isExpired ? (
                  expired
                ) : (
                  <FormField
                    control={form.control}
                    name="folders"
                    render={({ field, fieldState }) => (
                      <FieldSet
                        legend={t(`folders.label.${provider}`)}
                        description={t(`folders.help.${provider}`)}
                        error={fieldState.error?.message}
                      >
                        <FolderPicker
                          orgId={props.orgId}
                          baseId={props.base.id}
                          connectionId={connectionId}
                          provider={provider}
                          selected={field.value}
                          ownFolderIds={c.ownFolderIds}
                          onSelectedChange={c.onFoldersChange}
                          expired={expired}
                        />
                      </FieldSet>
                    )}
                  />
                ))}
              <FormField
                control={form.control}
                name="syncEvery"
                render={({ field }) => (
                  <FieldSet legend={t('syncEvery.label')} description={t('syncEvery.help')}>
                    <SegmentedControl
                      label={t('syncEvery.label')}
                      options={c.syncOptions}
                      value={field.value}
                      onValueChange={field.onChange}
                    />
                  </FieldSet>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('name')} <span className="text-muted-foreground">({t('optional')})</span>
                    </FormLabel>
                    <FormControl>
                      <Input autoComplete="off" placeholder={t('namePlaceholder')} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" type="button" onClick={props.onClose}>
                {t('cancel')}
              </Button>
              <Button type="submit" isLoading={c.isPending} disabled={c.isExpired}>
                {c.isEditing ? t('save') : t('submit')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
        {/* The dialogs are portals inside this form: React would pass their submit on to it */}
        <div
          role="presentation"
          onSubmit={(event) => {
            event.stopPropagation()
          }}
        >
          {c.isAdding && (
            <AddConnectionDialog
              orgId={props.orgId}
              canManage={c.canManageConnections}
              providerName={c.providerName}
              initialProviderKey={c.providerKey}
              returnTo={c.addReturnTo}
              onConnected={c.onConnected}
              onClose={c.onCloseAdd}
            />
          )}
          {c.reconnecting && (
            <ReconnectDialog
              orgId={props.orgId}
              connection={c.reconnecting}
              providerName={c.appName}
              returnTo={c.reconnectReturnTo}
              onClose={c.onCloseReconnect}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
