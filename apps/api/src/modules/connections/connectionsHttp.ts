// SPDX-License-Identifier: AGPL-3.0-only
import { lookup as dnsLookup } from 'node:dns'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { isIP } from 'node:net'

import {
  isPublicAddress,
  UnsafeAddressError,
} from '@/modules/knowledge/knowledgeIngestion/safeFetch.js'

import { RESPONSE_MAX_BYTES } from './connections.constants.js'

import type { LookupAddress } from 'node:dns'

// The calls the connections module makes to other apps (integrations.md, §8). Fixed endpoints of
// apps SurefyOS knows go through `provider`; addresses a person typed in (a custom API, an MCP
// server, a token URL) go through `external`, which resolves the host, refuses a private,
// loopback or metadata address when the connection is made, and follows no redirect. Hosts on
// the install's list for local servers may use plain http and private addresses.

export interface HttpRequest {
  method: 'GET' | 'POST' | 'DELETE'
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
}

export interface HttpResult {
  status: number
  headers: Record<string, string>
  text: string
  latencyMs: number
}

export type OutboundFailure = 'unreachable' | 'unsafe' | 'timeout' | 'too_large'

/** Nothing answered, or the address is not one SurefyOS may call. */
export class OutboundError extends Error {
  constructor(
    readonly kind: OutboundFailure,
    message: string,
  ) {
    super(message)
    this.name = 'OutboundError'
  }
}

export interface OutboundHttp {
  /** A fixed endpoint of a known app: `https` only, public addresses. */
  provider(url: string, request: HttpRequest): Promise<HttpResult>
  /** An address a person typed in; only the install's local hosts may be `http` or private. */
  external(url: string, request: HttpRequest): Promise<HttpResult>
}

const DEFAULT_TIMEOUT_MS = 10_000

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void

/** `dns.lookup` that fails unless every answer is public; handed to the HTTP client. */
function publicOnlyLookup(
  hostname: string,
  options: { all?: boolean },
  callback: LookupCallback,
): void {
  dnsLookup(hostname, { all: true }, (error, addresses) => {
    if (error) {
      callback(error, '')
      return
    }
    if (addresses.length === 0 || !addresses.every((a) => isPublicAddress(a.address))) {
      callback(new UnsafeAddressError(hostname), '')
      return
    }
    const first = addresses[0]
    if (options.all === true || first === undefined) {
      callback(null, addresses)
      return
    }
    callback(null, first.address, first.family)
  })
}

interface RequestSettings {
  allowPrivate: boolean
  allowHttp: boolean
}

function send(url: URL, request: HttpRequest, settings: RequestSettings): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    if (url.protocol !== 'https:' && !(settings.allowHttp && url.protocol === 'http:')) {
      reject(new OutboundError('unsafe', 'only https addresses are called'))
      return
    }
    if (url.username !== '' || url.password !== '') {
      reject(new OutboundError('unsafe', 'addresses carry no credentials'))
      return
    }
    // Node does not call `lookup` for an address written as an IP, so it is judged here
    const literal = url.hostname.replaceAll(/^\[|\]$/g, '')
    if (!settings.allowPrivate && isIP(literal) !== 0 && !isPublicAddress(literal)) {
      reject(new OutboundError('unsafe', 'private addresses are not called'))
      return
    }
    const started = performance.now()
    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const open = url.protocol === 'https:' ? httpsRequest : httpRequest
    const call = open(
      url,
      {
        method: request.method,
        timeout: timeoutMs,
        headers: {
          'user-agent': 'SurefyOS-Connections',
          accept: 'application/json, text/event-stream;q=0.9, */*;q=0.5',
          ...(request.body === undefined
            ? {}
            : { 'content-length': String(Buffer.byteLength(request.body)) }),
          ...request.headers,
        },
        ...(settings.allowPrivate ? {} : { lookup: publicOnlyLookup }),
      },
      (response) => {
        const chunks: Buffer[] = []
        let size = 0
        response.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > RESPONSE_MAX_BYTES) {
            call.destroy(new OutboundError('too_large', 'the answer is larger than the limit'))
            return
          }
          chunks.push(chunk)
        })
        response.on('end', () => {
          const headers: Record<string, string> = {}
          for (const [name, value] of Object.entries(response.headers)) {
            if (value !== undefined) headers[name] = Array.isArray(value) ? value.join(', ') : value
          }
          resolve({
            status: response.statusCode ?? 0,
            headers,
            text: Buffer.concat(chunks).toString('utf8'),
            latencyMs: Math.round(performance.now() - started),
          })
        })
        response.on('error', (error) => {
          reject(toOutboundError(error))
        })
      },
    )
    call.on('timeout', () => {
      call.destroy(new OutboundError('timeout', 'the request timed out'))
    })
    call.on('error', (error) => {
      reject(toOutboundError(error))
    })
    call.end(request.body)
  })
}

function toOutboundError(error: unknown): OutboundError {
  if (error instanceof OutboundError) return error
  if (error instanceof UnsafeAddressError) return new OutboundError('unsafe', error.message)
  return new OutboundError('unreachable', error instanceof Error ? error.message : 'unreachable')
}

export interface OutboundHttpOptions {
  /** Host names (lowercase) that may be reached over http and on private addresses. */
  localHosts: readonly string[]
}

export function createOutboundHttp(options: OutboundHttpOptions): OutboundHttp {
  const localHosts = new Set(options.localHosts.map((host) => host.toLowerCase()))
  return {
    provider: (url, request) =>
      send(new URL(url), request, { allowPrivate: false, allowHttp: false }),
    external: (url, request) => {
      const parsed = new URL(url)
      const isLocal = localHosts.has(parsed.hostname.toLowerCase())
      return send(parsed, request, { allowPrivate: isLocal, allowHttp: isLocal })
    },
  }
}

/** Whether `url` may be saved as a base URL: `https`, or `http` for a host on the local list. */
export function isBaseUrlAllowed(url: string, localHosts: readonly string[]): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.username !== '' || parsed.password !== '') return false
  if (parsed.protocol === 'https:') return true
  return parsed.protocol === 'http:' && localHosts.includes(parsed.hostname.toLowerCase())
}
