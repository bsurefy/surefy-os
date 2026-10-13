// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Banner } from '@surefy/ui/components/Feedback'
import { SelectInput } from '@surefy/ui/components/Forms'
import { Button } from '@surefy/ui/primitives/button'
import { Checkbox } from '@surefy/ui/primitives/checkbox'
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

import { API_KEY_EXPIRY_CHOICES } from '../ApiKeysSettings.constants'
import { useCreateApiKeyController } from './CreateApiKeyDialog.controller'
import CreatedKey from './CreatedKey'

const FORM_ID = 'create-api-key-form'

/**
 * Create a key: a name, the permissions it carries and when it expires. The full key is shown
 * once afterwards. Also opened from an agent's Publish tab with Run agents ticked.
 */
export default function CreateApiKeyDialog(
  props: Readonly<{
    orgId: string
    initialScopes?: readonly string[]
    onClose: () => void
  }>,
) {
  const c = useCreateApiKeyController(props)
  const { t, tScopes } = c

  if (c.created) {
    return (
      <CreatedKey
        orgId={props.orgId}
        name={c.created.apiKey.name}
        secret={c.created.secret}
        onDone={props.onClose}
      />
    )
  }

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
              {c.availableScopes.length === 0 && (
                <Banner tone="warning" title={t('noPermissions')} />
              )}
              <FormField
                control={c.form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('name')}</FormLabel>
                    <FormControl>
                      <Input
                        autoComplete="off"
                        autoFocus
                        placeholder={t('namePlaceholder')}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>{t('nameHelp')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={c.form.control}
                name="scopes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('permissions')}</FormLabel>
                    <div className="flex flex-col gap-2">
                      {c.availableScopes.map((scope) => (
                        <div key={scope} className="flex items-start gap-2">
                          <Checkbox
                            id={`api-key-scope-${scope}`}
                            checked={field.value.includes(scope)}
                            onCheckedChange={(checked) => {
                              field.onChange(
                                checked === true
                                  ? [...field.value, scope]
                                  : field.value.filter((item) => item !== scope),
                              )
                            }}
                          />
                          <Label
                            htmlFor={`api-key-scope-${scope}`}
                            className="flex flex-col items-start gap-0.5 text-left"
                          >
                            <span className="font-medium">{tScopes(`${scope}.name`)}</span>
                            <span className="text-caption text-muted-foreground font-normal">
                              {tScopes(`${scope}.description`)}
                            </span>
                          </Label>
                        </div>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={c.form.control}
                name="expiry"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('expires')}</FormLabel>
                    <SelectInput
                      aria-label={t('expires')}
                      options={API_KEY_EXPIRY_CHOICES.map((value) => ({
                        value,
                        label: t(`expiry.${value}`),
                      }))}
                      value={field.value}
                      onValueChange={field.onChange}
                    />
                    {field.value === 'never' && <FormDescription>{t('neverHelp')}</FormDescription>}
                    <FormMessage />
                  </FormItem>
                )}
              />
              {c.expiry === 'date' && (
                <FormField
                  control={c.form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('date')}</FormLabel>
                      <FormControl>
                        <Input type="date" min={c.earliestDate} {...field} />
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
              <Button
                type="submit"
                isLoading={c.isPending}
                disabled={c.availableScopes.length === 0}
              >
                {t('submit')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
