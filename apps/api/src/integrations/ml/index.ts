// SPDX-License-Identifier: AGPL-3.0-only
import { HttpMlService } from './ml.service.js'

import type { MlService } from './ml.types.js'
import type { Config } from '@/core/config/index.js'

export {
  MlError,
  MlInputError,
  MlTimeoutError,
  MlUnavailableError,
  MlUnsupportedFileError,
} from './ml.errors.js'
export { HttpMlService, type MlServiceOptions } from './ml.service.js'
export type {
  DocumentSection,
  DocumentTable,
  MlService,
  ParsedDocument,
  ParseDocumentInput,
} from './ml.types.js'

/** The ML service client. Nothing connects until the first call. */
export function createMl(config: Config): MlService {
  return new HttpMlService({ baseUrl: config.ml.url, serviceToken: config.ml.token })
}
