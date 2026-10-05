// SPDX-License-Identifier: AGPL-3.0-only
import { LocalStorageProvider, type StorageProvider } from '@/integrations/storage/index.js'

import { FilesController } from './files.controller.js'
import { filesRoutes } from './files.routes.js'
import { FilesService } from './files.service.js'

import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface FilesModuleDeps {
  storage: StorageProvider
}

/**
 * The routes behind local storage's signed links. With S3 the browser talks to the bucket
 * directly, so the module registers nothing.
 */
export function createFilesModule(deps: FilesModuleDeps) {
  const routes: FastifyPluginAsyncZod =
    deps.storage instanceof LocalStorageProvider
      ? filesRoutes(new FilesController(new FilesService(deps.storage)))
      : () => Promise.resolve()
  return { routes }
}
export type FilesModule = ReturnType<typeof createFilesModule>
