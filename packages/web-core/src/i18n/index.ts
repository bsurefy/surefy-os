// SPDX-License-Identifier: AGPL-3.0-only
export { createRequestConfig } from './createRequestConfig'
export { DEFAULT_LOCALE, ERROR_DOMAINS, LOCALE_COOKIE, SHARED_NAMESPACES } from './i18n.constants'
export type { SharedNamespace } from './i18n.constants'
export type {
  CommonMessages,
  EditionsMessages,
  ErrorsMessages,
  MessageTranslator,
  RequestConfigOptions,
  RequestHints,
  ResolveLocaleOptions,
  SessionMessages,
  SharedMessages,
  ValidationMessages,
} from './i18n.types'
export { loadSharedMessages, mergeMessages } from './loadSharedMessages'
export { matchLocale, parseAcceptLanguage, resolveLocale } from './resolveLocale'
export { createZodErrorMap, resolveIssueKey } from './zodErrorMap'
export type { IssueKey } from './zodErrorMap'
export { ZodErrorMapProvider } from './ZodErrorMapProvider'
