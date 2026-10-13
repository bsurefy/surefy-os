// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Plus, X } from 'lucide-react'

import { AGENT_HTTP_METHODS } from '@surefy/contracts'
import { Banner } from '@surefy/ui/components/Feedback'
import { Field, SelectInput } from '@surefy/ui/components/Forms'
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
import { useApiToolDialogController } from './ApiToolDialog.controller'
import TestResult from './TestResult'

import type { ApiToolDialogProps } from './ToolDialogs.types'

const FORM_ID = 'agent-api-tool-form'
const HEADERS_MAX = 20

/** An API tool: the request the agent sends, the account it signs in with and a test call. */
export default function ApiToolDialog(props: Readonly<ApiToolDialogProps>) {
  const c = useApiToolDialogController(props)
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
              <div className="flex items-start gap-2">
                <FormField
                  control={form.control}
                  name="method"
                  render={({ field }) => (
                    <FormItem className="w-32">
                      <FormLabel>{t('method.label')}</FormLabel>
                      <SelectInput
                        aria-label={t('method.label')}
                        options={AGENT_HTTP_METHODS.map((method) => ({
                          value: method,
                          label: method,
                        }))}
                        value={field.value}
                        onValueChange={field.onChange}
                      />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="url"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel>{t('url.label')}</FormLabel>
                      <FormControl>
                        <Input
                          type="url"
                          autoComplete="off"
                          placeholder="https://api.example.com/orders"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              {c.changesData && (
                <Banner
                  tone="warning"
                  title={t('changesData.title', { method: c.method })}
                  description={t('changesData.description')}
                />
              )}
              <FormField
                control={form.control}
                name="connectionId"
                render={({ field }) => (
                  <Field label={t('connection.label')} description={t('connection.help')}>
                    <ConnectionPicker
                      kind="api"
                      connections={props.connections}
                      isLoading={props.isLoadingConnections}
                      noneLabel={t('connection.none')}
                      value={field.value}
                      onValueChange={field.onChange}
                    />
                  </Field>
                )}
              />
              <fieldset className="flex flex-col gap-2">
                <legend className="text-body text-foreground font-medium">
                  {t('headers.label')}
                </legend>
                <p className="text-caption text-muted-foreground">{t('headers.help')}</p>
                {c.headers.fields.map((header, index) => (
                  <div key={header.id} className="flex items-start gap-2">
                    <FormField
                      control={form.control}
                      name={`headers.${index}.name`}
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormControl>
                            <Input
                              aria-label={t('headers.name', { number: index + 1 })}
                              placeholder={t('headers.namePlaceholder')}
                              autoComplete="off"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`headers.${index}.value`}
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormControl>
                            <Input
                              aria-label={t('headers.value', { number: index + 1 })}
                              placeholder={t('headers.valuePlaceholder')}
                              autoComplete="off"
                              {...field}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-md"
                      icon={X}
                      aria-label={t('headers.remove', { number: index + 1 })}
                      onClick={() => {
                        c.headers.remove(index)
                      }}
                    />
                  </div>
                ))}
                {c.headers.fields.length < HEADERS_MAX && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    icon={Plus}
                    className="self-start"
                    onClick={() => {
                      c.headers.append({ name: '', value: '' })
                    }}
                  >
                    {t('headers.add')}
                  </Button>
                )}
              </fieldset>
              <FormField
                control={form.control}
                name="inputSchema"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('inputSchema.label')}</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={5}
                        spellCheck={false}
                        className="font-mono"
                        placeholder={t('inputSchema.placeholder')}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>{t('inputSchema.help')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <section aria-labelledby="api-tool-test" className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <h3 id="api-tool-test" className="text-body text-foreground font-medium">
                    {t('test.title')}
                  </h3>
                  <p className="text-caption text-muted-foreground">
                    {c.changesData ? t('test.helpChanges', { method: c.method }) : t('test.help')}
                  </p>
                </div>
                <Field label={t('test.arguments')} error={c.testArgumentsError ?? undefined}>
                  <Textarea
                    rows={3}
                    spellCheck={false}
                    className="font-mono"
                    value={c.testArguments}
                    onChange={(event) => {
                      c.onTestArgumentsChange(event.target.value)
                    }}
                  />
                </Field>
                <Button
                  type="button"
                  variant="secondary"
                  className="self-start"
                  isLoading={c.test.isRunning}
                  onClick={c.onRunTest}
                >
                  {t('test.run')}
                </Button>
                {c.test.errorMessage !== null && (
                  <p role="alert" className="text-body text-destructive">
                    {c.test.errorMessage}
                  </p>
                )}
                {c.test.result && <TestResult result={c.test.result} />}
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
