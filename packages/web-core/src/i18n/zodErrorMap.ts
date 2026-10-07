// SPDX-License-Identifier: AGPL-3.0-only
import type { MessageTranslator } from './i18n.types'
import type { TranslationValues } from 'next-intl'
import type { z } from 'zod'

type RawIssue = z.core.$ZodRawIssue
type SizeIssue = z.core.$ZodRawIssue<z.core.$ZodIssueTooSmall | z.core.$ZodIssueTooBig>
type FormatIssue = z.core.$ZodRawIssue<z.core.$ZodIssueInvalidStringFormat>

/** A `validation` key and the ICU values of its message. */
export interface IssueKey {
  key: string
  values?: TranslationValues
}

// A string with a minimum of one character is the usual "required" rule.
const REQUIRED_MIN_LENGTH = 1
/** Key suffix per issue origin: `tooSmall`, `tooSmallNumber`, `tooSmallItems`, `tooSmallDate`. */
const SIZE_SUFFIX: Record<string, string> = {
  string: '',
  number: 'Number',
  int: 'Number',
  bigint: 'Number',
  array: 'Items',
  set: 'Items',
  date: 'Date',
}
const EXACT_KEY: Record<string, string> = { '': 'exactLength', Items: 'exactItems' }
const DATE_FORMATS = new Set(['date', 'datetime', 'time', 'duration'])

function translate(t: MessageTranslator, key: string, values?: TranslationValues): string {
  return t(key as never, values as never)
}

function has(t: MessageTranslator, key: string): boolean {
  return t.has(key as never)
}

function sizeKey(issue: SizeIssue): IssueKey {
  const isMinimum = issue.code === 'too_small'
  const bound = Number(isMinimum ? issue.minimum : issue.maximum)
  const suffix = SIZE_SUFFIX[issue.origin]
  if (suffix === undefined) return { key: `issues.${issue.code}` }
  const exactKey = EXACT_KEY[suffix]
  if (issue.exact && exactKey !== undefined) return { key: exactKey, values: { length: bound } }
  if (isMinimum && suffix === '' && bound === REQUIRED_MIN_LENGTH) return { key: 'required' }
  const exclusive = suffix === 'Number' && issue.inclusive === false ? 'Exclusive' : ''
  return {
    key: `${isMinimum ? 'tooSmall' : 'tooBig'}${suffix}${exclusive}`,
    values: { [isMinimum ? 'minimum' : 'maximum']: suffix === 'Date' ? new Date(bound) : bound },
  }
}

function formatKey(issue: FormatIssue): IssueKey {
  switch (issue.format) {
    case 'email':
      return { key: 'invalidEmail' }
    case 'url':
      return { key: 'invalidUrl' }
    case 'uuid':
    case 'guid':
      return { key: 'invalidUuid' }
    case 'starts_with':
      return { key: 'startsWith', values: { prefix: String(issue.prefix) } }
    case 'ends_with':
      return { key: 'endsWith', values: { suffix: String(issue.suffix) } }
    case 'includes':
      return { key: 'includes', values: { includes: String(issue.includes) } }
    default:
      return { key: DATE_FORMATS.has(issue.format) ? 'invalidDate' : 'invalidFormat' }
  }
}

/** The `validation` key and ICU values for a built-in Zod issue. */
export function resolveIssueKey(issue: RawIssue): IssueKey {
  switch (issue.code) {
    case 'invalid_type':
      return { key: issue.input === undefined || issue.input === null ? 'required' : 'invalidType' }
    case 'too_small':
    case 'too_big':
      return sizeKey(issue)
    case 'invalid_format':
      return formatKey(issue)
    case 'invalid_value':
      return { key: 'invalidValue' }
    case 'not_multiple_of':
      return { key: 'notMultipleOf', values: { divisor: issue.divisor } }
    case 'unrecognized_keys':
      return { key: 'unrecognizedKeys' }
    default:
      return { key: `issues.${issue.code}` }
  }
}

/**
 * A Zod error map built from the active locale's `validation` messages, for `z.config({
 * customError })`. Built-in issues reach the form already translated, with their parameters filled
 * in. Messages a schema sets itself (`custom.*` keys) never reach the map.
 */
export function createZodErrorMap(t: MessageTranslator): z.core.$ZodErrorMap {
  return (issue) => {
    const { key, values } = resolveIssueKey(issue)
    if (has(t, key)) return translate(t, key, values)
    return translate(t, 'issues.custom')
  }
}
