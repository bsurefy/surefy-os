// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Banner } from '@surefy/ui/components/Feedback'
import { Field, SelectInput, SwitchField } from '@surefy/ui/components/Forms'
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

import ConnectionPicker from '../ConnectionPicker'
import { permissionValueOf, useMcpToolDialogController } from './McpToolDialog.controller'

import type { McpToolDialogProps } from './ToolDialogs.types'

const FORM_ID = 'agent-mcp-tool-form'

/** An MCP server: its address, the account it signs in with and the actions found on it. */
export default function McpToolDialog(props: Readonly<McpToolDialogProps>) {
  const c = useMcpToolDialogController(props)
  const { t, form } = c

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{props.tool ? t('editTitle') : t('newTitle')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id={FORM_ID} noValidate onSubmit={c.onSubmit}>
            <DialogBody className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('name.label')}</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" autoFocus maxLength={100} {...field} />
                    </FormControl>
                    <FormDescription>{t('name.help')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('purpose.label')}</FormLabel>
                    <FormControl>
                      <Textarea rows={2} maxLength={1000} {...field} />
                    </FormControl>
                    <FormDescription>{t('purpose.help')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="serverUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('url.label')}</FormLabel>
                    <FormControl>
                      <Input
                        type="url"
                        autoComplete="off"
                        placeholder="https://mcp.example.com/sse"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="connectionId"
                render={({ field }) => (
                  <Field label={t('connection.label')} description={t('connection.help')}>
                    <ConnectionPicker
                      kind="mcp"
                      connections={props.connections}
                      isLoading={props.isLoadingConnections}
                      value={field.value}
                      onValueChange={field.onChange}
                    />
                  </Field>
                )}
              />
              <section aria-labelledby="mcp-tool-actions" className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <h3 id="mcp-tool-actions" className="text-body text-foreground font-medium">
                      {t('actions.title')}
                    </h3>
                    <p className="text-caption text-muted-foreground">{t('actions.help')}</p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    isLoading={c.isFinding}
                    onClick={c.onFindActions}
                  >
                    {c.actions.length > 0 ? t('actions.refresh') : t('actions.find')}
                  </Button>
                </div>
                {c.failureMessage !== null && (
                  <Banner
                    tone="destructive"
                    title={t('actions.failed')}
                    description={c.failureMessage}
                  />
                )}
                {c.hasFound && c.actions.length === 0 && (
                  <p className="text-body text-muted-foreground">{t('actions.none')}</p>
                )}
                {c.actions.length > 0 && (
                  <ul className="border-border divide-border divide-y rounded-lg border">
                    {c.actions.map((action) => (
                      <li key={action.name} className="flex items-center gap-3 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <SwitchField
                            size="sm"
                            label={action.name}
                            description={action.description || undefined}
                            checked={action.enabled}
                            onCheckedChange={(enabled) => {
                              c.onActionEnabledChange(action.name, enabled)
                            }}
                          />
                        </div>
                        <SelectInput
                          className="w-40"
                          aria-label={t('actions.permissionOf', { name: action.name })}
                          options={c.permissionOptions}
                          value={permissionValueOf(action)}
                          isDisabled={!action.enabled}
                          onValueChange={(value) => {
                            c.onActionPermissionChange(action.name, value)
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" type="button" onClick={props.onClose}>
                {t('cancel')}
              </Button>
              <Button type="submit">{t('save')}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
