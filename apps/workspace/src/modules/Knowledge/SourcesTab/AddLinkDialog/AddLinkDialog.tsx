// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { KNOWLEDGE_CRAWL_DEPTH_MAX, KNOWLEDGE_LINK_REFRESH } from '@surefy/contracts'
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@surefy/ui/primitives/form'
import { Input } from '@surefy/ui/primitives/input'
import { Textarea } from '@surefy/ui/primitives/textarea'

import { useAddLinkController } from './AddLinkDialog.controller'

const DEPTHS = Array.from({ length: KNOWLEDGE_CRAWL_DEPTH_MAX + 1 }, (_, depth) => String(depth))

/** Add link: a page or a crawl of the same site, with paths to keep or skip and a refresh schedule. */
export default function AddLinkDialog(
  props: Readonly<{ orgId: string; baseId: string; onClose: () => void }>,
) {
  const c = useAddLinkController(props)
  const { t } = c

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
          <form noValidate onSubmit={c.onSubmit}>
            <DialogBody className="flex flex-col gap-4">
              {c.formError && <Banner tone="destructive" title={c.formError} isAnnounced />}
              <FormField
                control={c.form.control}
                name="url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('url')}</FormLabel>
                    <FormControl>
                      <Input
                        type="url"
                        inputMode="url"
                        autoComplete="off"
                        autoFocus
                        placeholder="https://"
                        {...field}
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
                    <FormLabel>
                      {t('name')} <span className="text-muted-foreground">({t('optional')})</span>
                    </FormLabel>
                    <FormControl>
                      <Input autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={c.form.control}
                name="crawlDepth"
                render={({ field }) => (
                  <Field label={t('crawlDepth')} description={t('crawlDepthHelp')}>
                    <SelectInput
                      options={DEPTHS.map((depth) => ({
                        value: depth,
                        label: t('depth', { depth: Number(depth) }),
                      }))}
                      value={String(field.value)}
                      onValueChange={(value) => {
                        field.onChange(Number(value))
                      }}
                    />
                  </Field>
                )}
              />
              <FormField
                control={c.form.control}
                name="includePaths"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('includePaths')}{' '}
                      <span className="text-muted-foreground">({t('optional')})</span>
                    </FormLabel>
                    <FormControl>
                      <Textarea rows={2} placeholder="/docs" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={c.form.control}
                name="excludePaths"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('excludePaths')}{' '}
                      <span className="text-muted-foreground">({t('optional')})</span>
                    </FormLabel>
                    <FormControl>
                      <Textarea rows={2} placeholder="/blog" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={c.form.control}
                name="refresh"
                render={({ field }) => (
                  <Field label={t('refresh')}>
                    <SelectInput
                      options={KNOWLEDGE_LINK_REFRESH.map((value) => ({
                        value,
                        label: t(`refreshOptions.${value}`),
                      }))}
                      value={field.value}
                      onValueChange={field.onChange}
                    />
                  </Field>
                )}
              />
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" type="button" onClick={props.onClose}>
                {t('cancel')}
              </Button>
              <Button type="submit" isLoading={c.isPending}>
                {t('submit')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
