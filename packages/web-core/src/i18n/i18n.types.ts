// SPDX-License-Identifier: AGPL-3.0-only
import type common from '../../messages/en/common.json'
import type validation from '../../messages/en/validation.json'
import type { ErrorMessageKey } from '../errors/errors.types'
import type { AbstractIntlMessages } from 'next-intl'

export type CommonMessages = typeof common
export type ValidationMessages = typeof validation
/** The `errors` namespace: every API code, the client codes and `fallback`, merged from `errors/<domain>.json`. */
export type ErrorsMessages = Record<ErrorMessageKey, string>

/** The namespaces every app loads from `@surefy/web-core/messages/<locale>/`. */
export interface SharedMessages extends AbstractIntlMessages {
  common: CommonMessages
  validation: ValidationMessages
  errors: ErrorsMessages
}

/** What the app reads from the request for the locale decision (the cookie, `Accept-Language`). */
export interface RequestHints {
  /** The `surefy-locale` cookie: the profile preference or the organization default, already resolved. */
  locale?: string | null
  /** The `Accept-Language` header, for signed-out screens and first visits. */
  acceptLanguage?: string | null
  /** The person's IANA time zone, when known. */
  timeZone?: string | null
}

export interface ResolveLocaleOptions<Locale extends string> {
  locales: readonly Locale[]
  defaultLocale: Locale
  /** Candidates in priority order, for example an explicit locale and then the cookie. */
  candidates?: readonly (string | null | undefined)[]
  acceptLanguage?: string | null
}

export interface RequestConfigOptions<
  Locale extends string,
  AppMessages extends AbstractIntlMessages,
> {
  /** The locales the app ships (`LOCALES` in its constants). */
  locales: readonly Locale[]
  defaultLocale: Locale
  /** The app's own namespaces for a locale, usually `import(\`../../../messages/${locale}\`)`. */
  loadAppMessages: (locale: Locale) => Promise<AppMessages>
  /** Reads the cookie and headers of the current request; omitted on the server-less paths (tests). */
  getRequestHints?: () => Promise<RequestHints> | RequestHints
}

/**
 * Any next-intl translator, whatever its typed keys: only the call and `has` are used. The `never`
 * parameters let both an untyped and an app-typed `useTranslations()` result be passed in.
 */
export interface MessageTranslator {
  (key: never, values?: never): string
  has(key: never): boolean
}
