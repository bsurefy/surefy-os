// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Banner } from '@surefy/ui/components/Feedback'
import { FieldSet, SegmentedControl } from '@surefy/ui/components/Forms'
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

import { useWidgetDialogController } from './WidgetDialog.controller'

import type { WidgetDialogProps } from './WidgetChannel.types'

const FORM_ID = 'agent-widget-channel-form'

/** Set up or change the website widget: where it may load, and how it greets and looks. */
export default function WidgetDialog(props: Readonly<WidgetDialogProps>) {
  const c = useWidgetDialogController(props)
  const { t, form } = c
  const isNew = props.config === undefined

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? t('titleNew') : t('title')}</DialogTitle>
          <DialogDescription>
            {props.exposure ? t('exposes', { names: props.exposure }) : t('exposesNothing')}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id={FORM_ID} noValidate onSubmit={c.onSubmit}>
            <DialogBody className="flex flex-col gap-4">
              {c.formError && <Banner tone="destructive" title={c.formError} isAnnounced />}
              <FormField
                control={form.control}
                name="origins"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('origins.label')}</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        autoFocus
                        placeholder="https://www.example.com"
                        className="font-mono"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>{t('origins.help')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="greeting"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('greeting.label')}</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" maxLength={300} {...field} />
                    </FormControl>
                    <FormDescription>{t('greeting.help')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="theme"
                render={({ field }) => (
                  <FieldSet legend={t('theme.label')}>
                    <SegmentedControl
                      label={t('theme.label')}
                      options={c.themeOptions}
                      value={field.value}
                      onValueChange={field.onChange}
                    />
                  </FieldSet>
                )}
              />
              <FormField
                control={form.control}
                name="position"
                render={({ field }) => (
                  <FieldSet legend={t('position.label')}>
                    <SegmentedControl
                      label={t('position.label')}
                      options={c.positionOptions}
                      value={field.value}
                      onValueChange={field.onChange}
                    />
                  </FieldSet>
                )}
              />
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" type="button" onClick={props.onClose}>
                {t('cancel')}
              </Button>
              <Button type="submit" isLoading={c.isPending}>
                {isNew ? t('add') : t('save')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
