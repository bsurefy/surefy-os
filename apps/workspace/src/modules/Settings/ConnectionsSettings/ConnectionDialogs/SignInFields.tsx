// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import { SecretInput } from '@surefy/ui/components/Forms'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@surefy/ui/primitives/form'
import { Input } from '@surefy/ui/primitives/input'

import { SIGN_IN_METHOD } from '../ConnectionsSettings.constants'

import type { SignInMethod } from '../ConnectionsSettings.constants'
import type { ExtraField, SignInValues } from '../ConnectionsSettings.schema'
import type { Control } from 'react-hook-form'

export interface SignInFieldsProps {
  control: Control<SignInValues>
  method: SignInMethod
  providerName: string
  providerKey: string
  requiresBaseUrl: boolean
  extraFields: readonly ExtraField[]
  /** Reconnect asks for the credentials only. */
  isReconnect?: boolean
}

/** The fields of one way of signing in, shared by Add connection and Reconnect. */
export default function SignInFields({
  control,
  method,
  providerName,
  providerKey,
  requiresBaseUrl,
  extraFields,
  isReconnect = false,
}: Readonly<SignInFieldsProps>) {
  const t = useTranslations('settings.connections.fields')
  const secretLabels = { show: t('show'), hide: t('hide') }
  const isOauth = method === SIGN_IN_METHOD.OAUTH

  const secret = (name: 'secret' | 'password' | 'clientSecret', label: string) => (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <SecretInput labels={secretLabels} {...field} />
          </FormControl>
          <FormDescription>{t('secretHelp')}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  )

  const text = (
    name: 'username' | 'clientId' | 'tokenUrl' | 'oauthScopes' | 'baseUrl',
    label: string,
    help?: string,
    placeholder?: string,
  ) => (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input autoComplete="off" placeholder={placeholder} {...field} />
          </FormControl>
          {help && <FormDescription>{help}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  )

  return (
    <>
      {!isReconnect && (
        <FormField
          control={control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{isOauth ? t('nameOptional') : t('name')}</FormLabel>
              <FormControl>
                <Input
                  autoComplete="off"
                  placeholder={
                    isOauth ? t('namePlaceholderOauth', { app: providerName }) : undefined
                  }
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
      {!isReconnect &&
        requiresBaseUrl &&
        text('baseUrl', t('baseUrl'), t('baseUrlHelp'), 'https://')}
      {isOauth && (
        <p className="text-body text-muted-foreground">{t('oauthHelp', { app: providerName })}</p>
      )}
      {method === SIGN_IN_METHOD.API_KEY && secret('secret', t('apiKey'))}
      {method === SIGN_IN_METHOD.BEARER && secret('secret', t('token'))}
      {method === SIGN_IN_METHOD.BASIC && (
        <>
          {text('username', t('username'))}
          {secret('password', t('password'))}
        </>
      )}
      {method === SIGN_IN_METHOD.CLIENT_CREDENTIALS && (
        <>
          {text('tokenUrl', t('tokenUrl'), undefined, 'https://')}
          {text('clientId', t('clientId'))}
          {secret('clientSecret', t('clientSecret'))}
          {text('oauthScopes', t('oauthScopes'), t('oauthScopesHelp'))}
        </>
      )}
      {method === SIGN_IN_METHOD.NONE && (
        <p className="text-body text-muted-foreground">{t('noneHelp')}</p>
      )}
      {!isReconnect &&
        extraFields.map(({ key, isRequired }) => (
          <FormField
            key={key}
            control={control}
            name={`extra.${key}`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t(`extra.${providerKey}.${key}`)}
                  {isRequired ? '' : ` ${t('optionalSuffix')}`}
                </FormLabel>
                <FormControl>
                  <Input autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ))}
    </>
  )
}
