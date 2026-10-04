// SPDX-License-Identifier: AGPL-3.0-only
import type { ApiExtension, ExtensionContext } from './extension.types.js'

/**
 * The only place the public code names the private packages. Names only, never an import that
 * would fail the build. `ee` first: Cloud builds on it.
 */
export const OPTIONAL_EXTENSIONS = ['@surefy/ee-api', '@surefy/cloud-api'] as const

export type ExtensionImporter = (packageName: string) => Promise<unknown>

const defaultImporter: ExtensionImporter = (packageName) => import(packageName)

/** `ERR_MODULE_NOT_FOUND` for that package name only: a missing dependency inside an installed extension is a broken install. */
export function isModuleNotFound(error: unknown, packageName: string): boolean {
  if (typeof error !== 'object' || error === null) return false
  const code = 'code' in error ? error.code : undefined
  const message = error instanceof Error ? error.message : ''
  return (
    (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') &&
    message.includes(packageName)
  )
}

const isExtensionModule = (value: unknown): value is { extension: ApiExtension } =>
  typeof value === 'object' &&
  value !== null &&
  'extension' in value &&
  typeof value.extension === 'object' &&
  value.extension !== null &&
  'register' in value.extension &&
  typeof value.extension.register === 'function'

/**
 * Loads the optional private extensions that are installed in this image and lets each one
 * register through the hooks. Returns their names, in load order. In a Community image nothing
 * is installed, so every hook keeps its Community default.
 */
export async function loadExtensions(
  context: ExtensionContext,
  options: { importer?: ExtensionImporter; packages?: readonly string[] } = {},
): Promise<string[]> {
  const importer = options.importer ?? defaultImporter
  const names: string[] = []
  for (const packageName of options.packages ?? OPTIONAL_EXTENSIONS) {
    const imported = await importer(packageName).catch((error: unknown) => {
      if (isModuleNotFound(error, packageName)) return null // not installed in this image: skip
      throw error // installed but broken: fail fast
    })
    if (imported === null) continue
    if (!isExtensionModule(imported)) {
      throw new TypeError(`${packageName} does not export an ApiExtension named 'extension'`)
    }
    await imported.extension.register(context)
    names.push(imported.extension.name)
  }
  context.logger.info({ extensions: names }, 'extensions loaded')
  return names
}
