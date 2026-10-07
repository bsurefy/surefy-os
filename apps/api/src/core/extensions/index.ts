// SPDX-License-Identifier: AGPL-3.0-only
export type {
  ApiExtension,
  ExtensionContext,
  ExtensionHooks,
  ExtensionRegistry,
  MigrationsFolder,
} from './extension.types.js'
export {
  isModuleNotFound,
  loadExtensions,
  OPTIONAL_EXTENSIONS,
  type ExtensionImporter,
} from './loadExtensions.js'
export { createExtensionRegistry } from './registry.js'
