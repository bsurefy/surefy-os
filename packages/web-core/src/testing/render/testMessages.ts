// SPDX-License-Identifier: AGPL-3.0-only
import { DEFAULT_LOCALE } from '../../i18n/i18n.constants'
import { loadSharedMessages } from '../../i18n/loadSharedMessages'

import type { SharedMessages } from '../../i18n/i18n.types'

/** The shared English namespaces (`common`, `validation`, `errors`), loaded once per test file. */
export const testMessages: SharedMessages = await loadSharedMessages(DEFAULT_LOCALE)
