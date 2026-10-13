// SPDX-License-Identifier: AGPL-3.0-only
'use client'
'use no memo'

import { useTranslations } from 'next-intl'
import { useMemo } from 'react'

import type { ConnectionProviderDto } from '@surefy/contracts'
import { SegmentedControl } from '@surefy/ui/components/Forms'
import { Button } from '@surefy/ui/primitives/button'
import { Form } from '@surefy/ui/primitives/form'
import { useForm } from '@surefy/web-core/forms'

import { createSignInSchema } from '../../ConnectionsSettings.schema'
import SignInFields from '../SignInFields'

import type { SignInMethod } from '../../ConnectionsSettings.constants'
import type { ExtraField, SignInValues } from '../../ConnectionsSettings.schema'

export interface SignInStepProps {
  provider: ConnectionProviderDto
  providerName: string
  methods: SignInMethod[]
  method: SignInMethod
  onMethodChange: (method: SignInMethod) => void
  extraFields: ExtraField[]
  initialValues: SignInValues | null
  canGoBack: boolean
  onBack: () => void
  onSubmit: (values: SignInValues) => void
}

const EMPTY_VALUES = {
  name: '',
  baseUrl: '',
  secret: '',
  username: '',
  password: '',
  tokenUrl: '',
  clientId: '',
  clientSecret: '',
  oauthScopes: '',
} as const

/** Step 2: the fields depend on how the app signs in. */
export default function SignInStep(props: Readonly<SignInStepProps>) {
  const { provider, providerName, methods, method, onMethodChange, extraFields } = props
  const t = useTranslations('settings.connections.add.signIn')
  const schema = useMemo(
    () =>
      createSignInSchema({
        method,
        requiresBaseUrl: provider.requiresBaseUrl,
        extraFields,
      }),
    [method, provider.requiresBaseUrl, extraFields],
  )
  const form = useForm({
    schema,
    defaultValues: props.initialValues ?? {
      ...EMPTY_VALUES,
      extra: Object.fromEntries(extraFields.map(({ key }) => [key, ''])),
    },
  })

  return (
    <Form {...form}>
      <form
        id="add-connection-sign-in"
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          void form.handleSubmit(props.onSubmit)(event)
        }}
      >
        {methods.length > 1 && (
          <SegmentedControl
            label={t('method')}
            options={methods.map((value) => ({ value, label: t(`methods.${value}`) }))}
            value={method}
            onValueChange={onMethodChange}
          />
        )}
        <SignInFields
          control={form.control}
          method={method}
          providerName={providerName}
          requiresBaseUrl={provider.requiresBaseUrl}
          extraFields={extraFields}
          providerKey={provider.providerKey}
        />
        <div className="flex justify-between gap-2">
          {props.canGoBack ? (
            <Button variant="secondary" type="button" onClick={props.onBack}>
              {t('back')}
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit">{t('next')}</Button>
        </div>
      </form>
    </Form>
  )
}
