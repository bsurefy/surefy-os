// SPDX-License-Identifier: AGPL-3.0-only
import type { InstallSettingsDto, UpdateInstallSettingsInput } from '@surefy/contracts'

import type { InstallFormValues, SmtpFormValues } from './InstallSettings.schema'

export const SMTP_DEFAULTS: SmtpFormValues = {
  host: '',
  port: '587',
  secure: false,
  username: '',
  password: '',
  fromAddress: '',
  fromName: '',
}

export function toInstallFormValues(settings: InstallSettingsDto): InstallFormValues {
  return {
    emailPassword: settings.signIn.emailPassword,
    google: settings.signIn.oauth.google.enabled,
    microsoft: settings.signIn.oauth.microsoft.enabled,
    github: settings.signIn.oauth.github.enabled,
    signupPolicy: settings.signupPolicy,
    orgCreationPolicy: settings.orgCreationPolicy,
    searxngUrl: settings.webSearch.searxngUrl ?? '',
  }
}

/** The PATCH body of the main form. The creation policy is sent only where it applies. */
export function toInstallUpdate(
  values: InstallFormValues,
  canCreateOrganizations: boolean,
): UpdateInstallSettingsInput {
  return {
    signupPolicy: values.signupPolicy,
    ...(canCreateOrganizations ? { orgCreationPolicy: values.orgCreationPolicy } : {}),
    signIn: {
      emailPassword: values.emailPassword,
      oauth: { google: values.google, microsoft: values.microsoft, github: values.github },
    },
    webSearch: { searxngUrl: values.searxngUrl === '' ? null : values.searxngUrl },
  }
}

export function toSmtpFormValues(settings: InstallSettingsDto): SmtpFormValues {
  const { smtp } = settings
  if (!smtp) return SMTP_DEFAULTS
  return {
    host: smtp.host,
    port: String(smtp.port),
    secure: smtp.secure,
    username: smtp.username ?? '',
    password: '',
    fromAddress: smtp.fromAddress,
    fromName: smtp.fromName ?? '',
  }
}

/** The PATCH body of the mail server: an empty password keeps the stored one. */
export function toSmtpUpdate(values: SmtpFormValues): UpdateInstallSettingsInput {
  return {
    smtp: {
      host: values.host,
      port: Number(values.port),
      secure: values.secure,
      username: values.username === '' ? null : values.username,
      fromAddress: values.fromAddress,
      fromName: values.fromName === '' ? null : values.fromName,
      ...(values.password === '' ? {} : { password: values.password }),
    },
  }
}

export type OrganizationLimitState = 'unlimited' | 'within' | 'atLimit' | 'overLimit'

/** How the organizations on the install compare with what the entitlement source allows. */
export function getOrganizationLimitState(
  organizations: InstallSettingsDto['organizations'],
): OrganizationLimitState {
  if (organizations.max === null) return 'unlimited'
  if (organizations.count > organizations.max) return 'overLimit'
  return organizations.count === organizations.max ? 'atLimit' : 'within'
}

/** True when a newer version has been published. */
export function hasUpdate(version: InstallSettingsDto['version']): boolean {
  return version.latest !== null && version.latest !== version.current
}
