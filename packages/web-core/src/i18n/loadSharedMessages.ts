// SPDX-License-Identifier: AGPL-3.0-only
import { ERROR_DOMAINS } from './i18n.constants'

import type {
  CommonMessages,
  ErrorsMessages,
  SharedMessages,
  ValidationMessages,
} from './i18n.types'
import type { AbstractIntlMessages } from 'next-intl'

/** A JSON module loaded with `import()`: the bundlers and Vite expose the object as `default`. */
async function loadJson<T>(loaded: Promise<unknown>): Promise<T> {
  const jsonModule = (await loaded) as { default: T }
  return jsonModule.default
}

/**
 * The shared namespaces of one locale from `@surefy/web-core/messages/<locale>/`: `common`,
 * `validation` and `errors`, the last one merged flat from `errors/<domain>.json` so the keys stay
 * the error codes. The locale must be a supported one (see `resolveLocale`); a missing file throws.
 */
export async function loadSharedMessages(locale: string): Promise<SharedMessages> {
  const [common, validation, errorFiles] = await Promise.all([
    loadJson<CommonMessages>(import(`../../messages/${locale}/common.json`)),
    loadJson<ValidationMessages>(import(`../../messages/${locale}/validation.json`)),
    Promise.all(
      ERROR_DOMAINS.map((domain) =>
        loadJson<Partial<ErrorsMessages>>(import(`../../messages/${locale}/errors/${domain}.json`)),
      ),
    ),
  ])
  const errors = Object.assign({}, ...errorFiles) as ErrorsMessages
  return { common, validation, errors }
}

/** The shared namespaces plus the app's own, as one messages object. A namespace name is unique. */
export function mergeMessages<AppMessages extends AbstractIntlMessages>(
  shared: SharedMessages,
  app: AppMessages,
): SharedMessages & AppMessages {
  for (const namespace of Object.keys(app)) {
    if (namespace in shared) {
      throw new Error(`Message namespace "${namespace}" is shared by @surefy/web-core; rename it`)
    }
  }
  return { ...shared, ...app }
}
