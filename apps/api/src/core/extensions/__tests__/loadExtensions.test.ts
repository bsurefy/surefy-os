// SPDX-License-Identifier: AGPL-3.0-only
import { pino } from 'pino'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import {
  createExtensionRegistry,
  isModuleNotFound,
  loadExtensions,
  OPTIONAL_EXTENSIONS,
  type ApiExtension,
  type ExtensionContext,
} from '../index.js'

const logger = pino({ level: 'silent' })
const notFound = (packageName: string) =>
  Object.assign(new Error(`Cannot find package '${packageName}'`), { code: 'ERR_MODULE_NOT_FOUND' })

const context = (): ExtensionContext =>
  ({ logger, hooks: createExtensionRegistry(logger) }) as unknown as ExtensionContext

// Package names appear only in loadExtensions.ts (open-core rule), so tests read them from there.
const [enterprisePackage] = OPTIONAL_EXTENSIONS

describe('loadExtensions', () => {
  it('skips packages that are not installed', async () => {
    const importer = vi.fn((name: string) => Promise.reject(notFound(name)))
    await expect(loadExtensions(context(), { importer })).resolves.toEqual([])
    expect(importer).toHaveBeenCalledTimes(2)
  })

  it('registers installed extensions in order and returns their names', async () => {
    const ctx = context()
    const register = vi.fn((c: ExtensionContext) => {
      c.hooks.addMigrationsFolder('/ee/migrations', '__drizzle_migrations_ee')
    })
    const ee: ApiExtension = { name: 'surefy-ee', register }
    const importer = (name: string) =>
      name === enterprisePackage
        ? Promise.resolve({ extension: ee })
        : Promise.reject(notFound(name))
    await expect(loadExtensions(ctx, { importer })).resolves.toEqual(['surefy-ee'])
    expect(register).toHaveBeenCalledWith(ctx)
    expect((ctx.hooks as ReturnType<typeof createExtensionRegistry>).migrationsFolders()).toEqual([
      { path: '/ee/migrations', table: '__drizzle_migrations_ee' },
    ])
  })

  it('fails fast when an installed extension is broken', async () => {
    const importer = () => Promise.reject(notFound('some-inner-dependency'))
    await expect(loadExtensions(context(), { importer })).rejects.toThrow(/some-inner-dependency/)
  })

  it('fails when the package does not export an ApiExtension', async () => {
    const importer = () => Promise.resolve({ somethingElse: true })
    await expect(loadExtensions(context(), { importer })).rejects.toBeInstanceOf(TypeError)
  })

  it('matches module-not-found errors for the package only', () => {
    expect(isModuleNotFound(notFound(enterprisePackage), enterprisePackage)).toBe(true)
    expect(isModuleNotFound(notFound('left-pad'), enterprisePackage)).toBe(false)
    expect(isModuleNotFound(new Error('boom'), enterprisePackage)).toBe(false)
  })
})

describe('createExtensionRegistry', () => {
  it('starts with Community defaults and collects contributions', () => {
    const registry = createExtensionRegistry(logger)
    expect(registry.routes()).toEqual([])
    expect(registry.jobs()).toEqual([])
    expect(registry.authPlugins()).toEqual([])
    const plugin = async () => {
      // an extension's route plugin
    }
    registry.addRoutes(plugin)
    registry.addSettingsSchema('sso', z.object({}))
    registry.addSettingsSchema('sso', z.object({ enabled: z.boolean() }))
    expect(registry.routes()).toEqual([plugin])
    expect([...registry.settingsSchemas().keys()]).toEqual(['sso'])
  })
})
