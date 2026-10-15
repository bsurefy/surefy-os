// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Banner } from '@surefy/ui/components/Feedback'
import { MultiSelect } from '@surefy/ui/components/Forms'
import { Badge } from '@surefy/ui/primitives/badge'
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
import { Label } from '@surefy/ui/primitives/label'
import { RadioGroup, RadioGroupItem } from '@surefy/ui/primitives/radio-group'
import { Textarea } from '@surefy/ui/primitives/textarea'

import { usePromptFormController } from './PromptForm.controller'

import type { PromptFormProps } from './PromptForm.controller'

const FORM_ID = 'prompt-form'

/** Create or change a prompt (chat.md §2); `{name}` in the text becomes a variable asked for on use. */
export default function PromptForm(props: Readonly<PromptFormProps>) {
  const c = usePromptFormController(props)
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
          <DialogTitle>{t(c.isEdit ? 'editTitle' : 'newTitle')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <Form {...c.form}>
          <form id={FORM_ID} noValidate onSubmit={c.onSubmit}>
            <DialogBody className="flex flex-col gap-4">
              {c.formError && <Banner tone="destructive" title={c.formError} isAnnounced />}
              <FormField
                control={c.form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('title')}</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" autoFocus {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={c.form.control}
                name="body"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('body')}</FormLabel>
                    <FormControl>
                      <Textarea rows={6} placeholder={t('bodyPlaceholder')} {...field} />
                    </FormControl>
                    <FormDescription>{t('bodyHelp')}</FormDescription>
                    {c.variables.length > 0 && (
                      <p className="flex flex-wrap items-center gap-1.5">
                        <span className="text-caption text-muted-foreground">{t('variables')}</span>
                        {c.variables.map((name) => (
                          <Badge key={name} variant="outline" className="font-mono">
                            {`{${name}}`}
                          </Badge>
                        ))}
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              {props.canManageShared && (
                <FormField
                  control={c.form.control}
                  name="visibility"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('visibility.label')}</FormLabel>
                      <FormControl>
                        <RadioGroup value={field.value} onValueChange={field.onChange}>
                          {(['personal', 'shared'] as const).map((value) => (
                            <div key={value} className="flex items-start gap-2">
                              <RadioGroupItem
                                id={`prompt-visibility-${value}`}
                                value={value}
                                className="mt-1"
                              />
                              <Label
                                htmlFor={`prompt-visibility-${value}`}
                                className="flex flex-col items-start gap-0.5 text-left"
                              >
                                <span className="font-medium">{t(`visibility.${value}.name`)}</span>
                                <span className="text-caption text-muted-foreground font-normal">
                                  {t(`visibility.${value}.description`)}
                                </span>
                              </Label>
                            </div>
                          ))}
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              {props.canManageShared && c.isShared && (
                <FormField
                  control={c.form.control}
                  name="teamIds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('teams.label')}</FormLabel>
                      <FormControl>
                        <MultiSelect
                          options={c.teamOptions}
                          value={field.value}
                          onValueChange={field.onChange}
                          isLoading={c.isLoadingTeams}
                          labels={{
                            placeholder: t('teams.placeholder'),
                            search: t('teams.search'),
                            empty: t('teams.empty'),
                            remove: (label) => t('teams.remove', { label }),
                            more: (count) => t('teams.more', { count }),
                          }}
                        />
                      </FormControl>
                      <FormDescription>{t('teams.help')}</FormDescription>
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
              <Button type="submit" isLoading={c.isPending}>
                {t(c.isEdit ? 'save' : 'create')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
