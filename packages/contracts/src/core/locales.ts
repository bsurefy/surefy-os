// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

/**
 * BCP 47 tags the web apps ship messages for. English is the source locale; a new locale is added
 * here together with its `messages/<locale>/` folders (frontend/i18n.md).
 */
export const SUPPORTED_LOCALES = ['en'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]

/** A user or organization locale preference. */
export const localeSchema = z.enum(SUPPORTED_LOCALES)
