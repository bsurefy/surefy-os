// SPDX-License-Identifier: AGPL-3.0-only
export { createRequestConfig, resolveTimeZone } from './createRequestConfig'
export {
  DEFAULT_LOCALE,
  DEFAULT_TIME_ZONE,
  ERROR_DOMAINS,
  LOCALE_COOKIE,
  SHARED_NAMESPACES,
  TIME_ZONE_COOKIE,
} from './i18n.constants'
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
export { TimeZoneSync } from './TimeZoneSync'
export { ZodErrorMapProvider } from './ZodErrorMapProvider'
