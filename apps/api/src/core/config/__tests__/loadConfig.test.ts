// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it, vi } from 'vitest'

import { ConfigError, loadConfig, parseConfig } from '../index.js'
import { validEnv } from './env.fixture.js'

describe('parseConfig', () => {
  it('applies defaults and groups the env into typed settings', () => {
    const config = parseConfig('api', validEnv)
    expect(config.app).toEqual({ name: 'SurefyOS', env: 'development', isProduction: false })
    expect(config.process.name).toBe('api')
    expect(config.server).toMatchObject({ host: '0.0.0.0', port: 4000, trustProxy: 'loopback' })
    expect(config.worker).toEqual({ healthPort: 4001, concurrency: 5 })
    expect(config.database).toEqual({ url: validEnv.DATABASE_URL, poolSize: 10 })
    expect(config.web.origins).toEqual(['http://localhost:3000'])
    expect(config.storage).toEqual({ driver: 'local', path: './data/storage' })
    expect(config.mail).toEqual({ driver: 'console', from: 'SurefyOS <no-reply@localhost>' })
    expect(config.auth.oauth).toEqual({})
  })

  it('turns the docs on in development and off in production unless enabled', () => {
    expect(parseConfig('api', validEnv).server.docsEnabled).toBe(true)
    expect(parseConfig('api', { ...validEnv, NODE_ENV: 'production' }).server.docsEnabled).toBe(
      false,
    )
    expect(
      parseConfig('api', { ...validEnv, NODE_ENV: 'production', API_DOCS_ENABLED: 'true' }).server
        .docsEnabled,
    ).toBe(true)
  })

  it('parses TRUST_PROXY as a boolean, a hop count, a keyword or a list', () => {
    const trustProxy = (value: string) =>
      parseConfig('api', { ...validEnv, TRUST_PROXY: value }).server.trustProxy
    expect(trustProxy('true')).toBe(true)
    expect(trustProxy('false')).toBe(false)
    expect(trustProxy('2')).toBe(2)
    expect(trustProxy('loopback')).toBe('loopback')
    expect(trustProxy('loopback, uniquelocal')).toEqual(['loopback', 'uniquelocal'])
  })

  it('splits PUBLIC_CORS_ORIGINS and collects the web origins', () => {
    const config = parseConfig('api', {
      ...validEnv,
      PUBLIC_CORS_ORIGINS: 'https://a.example, https://b.example',
      CONSOLE_ORIGIN: 'https://console.example',
    })
    expect(config.api.publicCorsOrigins).toEqual(['https://a.example', 'https://b.example'])
    expect(config.web.origins).toEqual(['http://localhost:3000', 'https://console.example'])
  })

  it('requires the S3 variables only when the s3 driver is selected', () => {
    expect(() => parseConfig('api', { ...validEnv, STORAGE_DRIVER: 's3' })).toThrow(ConfigError)
    const config = parseConfig('api', {
      ...validEnv,
      STORAGE_DRIVER: 's3',
      STORAGE_S3_BUCKET: 'surefy',
      STORAGE_S3_ENDPOINT: 'http://127.0.0.1:9000',
      STORAGE_S3_FORCE_PATH_STYLE: 'true',
      STORAGE_S3_ACCESS_KEY_ID: 'key',
      STORAGE_S3_SECRET_ACCESS_KEY: 'secret',
    })
    expect(config.storage).toEqual({
      driver: 's3',
      bucket: 'surefy',
      region: 'auto',
      endpoint: 'http://127.0.0.1:9000',
      forcePathStyle: true,
      accessKeyId: 'key',
      secretAccessKey: 'secret',
    })
  })

  it('requires the SMTP host only when the smtp driver is selected', () => {
    expect(() => parseConfig('api', { ...validEnv, MAIL_DRIVER: 'smtp' })).toThrow(ConfigError)
    const config = parseConfig('api', {
      ...validEnv,
      MAIL_DRIVER: 'smtp',
      SMTP_HOST: 'smtp.example',
      SMTP_USER: 'user',
      SMTP_PASSWORD: 'pass',
    })
    expect(config.mail).toEqual({
      driver: 'smtp',
      from: 'SurefyOS <no-reply@localhost>',
      smtp: { host: 'smtp.example', port: 587, secure: false, user: 'user', password: 'pass' },
    })
  })

  it('enables an OAuth provider only with both its id and secret', () => {
    expect(() => parseConfig('api', { ...validEnv, OAUTH_GOOGLE_CLIENT_ID: 'id' })).toThrow(
      /OAUTH_GOOGLE_CLIENT_SECRET/,
    )
    const config = parseConfig('api', {
      ...validEnv,
      OAUTH_GITHUB_CLIENT_ID: 'id',
      OAUTH_GITHUB_CLIENT_SECRET: 'secret',
    })
    expect(config.auth.oauth).toEqual({ github: { clientId: 'id', clientSecret: 'secret' } })
  })

  it('rejects a short secret and a non-32-byte encryption key with the variable names', () => {
    expect(() => parseConfig('api', { ...validEnv, AUTH_SECRET: 'short' })).toThrow(/AUTH_SECRET/)
    expect(() =>
      parseConfig('api', { ...validEnv, ENCRYPTION_KEY: Buffer.alloc(16).toString('base64') }),
    ).toThrow(/ENCRYPTION_KEY/)
  })

  it('returns a deeply frozen object', () => {
    const config = parseConfig('worker', validEnv)
    expect(Object.isFrozen(config)).toBe(true)
    expect(Object.isFrozen(config.database)).toBe(true)
    expect(Object.isFrozen(config.web.origins)).toBe(true)
  })
})

describe('loadConfig', () => {
  it('exits the process with the issues when the env is invalid', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit')
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {
      // silence the message in the test output
    })
    expect(() => loadConfig('api', {})).toThrow('exit')
    expect(exit).toHaveBeenCalledWith(1)
    expect(error.mock.calls[0]?.[0]).toMatch(/Invalid configuration/)
    exit.mockRestore()
    error.mockRestore()
  })

  it('returns the config for a valid env', () => {
    expect(loadConfig('cli', validEnv).process.name).toBe('cli')
  })
})
