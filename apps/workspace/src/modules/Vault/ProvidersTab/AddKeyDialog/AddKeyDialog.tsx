// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useWatch } from 'react-hook-form'

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

import { useAddKeyController } from './AddKeyDialog.controller'
import ConnectionTestResult from '../../ConnectionTestResult'
import { KEY_SCOPE } from '../../Vault.constants'

import type { AddKeyDialogProps } from './AddKeyDialog.controller'

const FORM_ID = 'add-key-form'

/**
 * Add API key (vault.md §2): provider → label → secret → Test connection (required; shows the
 * models found and the latency) → scope → Save. A rotation fixes the provider and scope.
 */
export default function AddKeyDialog(props: Readonly<AddKeyDialogProps>) {
  const c = useAddKeyController(props)
  const { t } = c
  // `useWatch`, not `form.watch()`: the React Compiler would keep the first value of the latter
  const providerKey = useWatch({ control: c.form.control, name: 'providerKey' })
  const showsAddress = providerKey === 'openai_compatible'
  const scope = useWatch({ control: c.form.control, name: 'scope' })

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {c.isRotation ? t('rotateTitle', { name: props.rotate?.name ?? '' }) : t('title')}
          </DialogTitle>
          <DialogDescription>
            {c.isRotation ? t('rotateDescription') : t('description')}
          </DialogDescription>
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
                        isDisabled={c.isRotation}
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
              {showsAddress && (
                <FormField
                  control={c.form.control}
                  name="baseUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('baseUrl')}</FormLabel>
                      <FormControl>
                        <Input autoComplete="off" inputMode="url" {...field} />
                      </FormControl>
                      <FormDescription>{t('baseUrlHelp')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
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
                    <FormDescription>{t('secretHelp')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {c.testResult && <ConnectionTestResult result={c.testResult} />}
              {props.mode === 'organization' && !c.isRotation && (
                <>
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
                </>
              )}
              {props.mode === 'personal' && (
                <p className="text-body text-muted-foreground">{t('scopePersonal')}</p>
              )}
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
              <p className="text-caption text-muted-foreground">{t('neverShownAgain')}</p>
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" type="button" onClick={props.onClose}>
                {t('cancel')}
              </Button>
              <Button type="submit" isLoading={c.isPending} disabled={!c.canSave}>
                {c.isRotation ? t('saveReplacement') : t('save')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
