// SPDX-License-Identifier: AGPL-3.0-only
/* eslint-disable sonarjs/no-hardcoded-ip -- the private address ranges are the blocklist itself */
import { lookup as dnsLookup } from 'node:dns'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { BlockList, isIP } from 'node:net'

import type { LookupAddress } from 'node:dns'

// Outbound requests to addresses people typed in (link sources). The address is checked when the
// connection is made, so a host that resolves to a private address, or changes its answer between
// a check and the connection (DNS rebinding), never reaches the internal network.

const blocked = new BlockList()
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(network, prefix, 'ipv4')
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blocked.addSubnet(network, prefix, 'ipv6')
}

/** True for an address on the public internet. IPv4-mapped IPv6 addresses are judged as IPv4. */
export function isPublicAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)
  const ip = mapped?.[1] ?? address
  const family = isIP(ip)
  if (family === 0) return false
  return !blocked.check(ip, family === 4 ? 'ipv4' : 'ipv6')
}

export class UnsafeAddressError extends Error {
  constructor(host: string) {
    super(`${host} does not resolve to a public address`)
  }
}

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void

/** `dns.lookup` that fails unless every answer is public; handed to the HTTP client. */
function checkedLookup(
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

export interface SafeResponse {
  status: number
  headers: Record<string, string>
  body: Buffer
  /** The address after redirects. */
  url: string
}

export interface SafeGetOptions {
  timeoutMs?: number
  maxBytes?: number
  maxRedirects?: number
  userAgent?: string
}

const DEFAULTS = { timeoutMs: 20_000, maxBytes: 10 * 1024 * 1024, maxRedirects: 5 } as const

export type SafeGet = (url: string, options?: SafeGetOptions) => Promise<SafeResponse>

/** GET with the address checks above, a size limit and a timeout; redirects are followed by hand. */
export const safeGet: SafeGet = async (url, options = {}) => {
  const settings = { ...DEFAULTS, ...options }
  let current = new URL(url)
  for (let hop = 0; hop <= settings.maxRedirects; hop += 1) {
    if (current.protocol !== 'http:' && current.protocol !== 'https:') {
      throw new UnsafeAddressError(current.host)
    }
    if (current.username !== '' || current.password !== '')
      throw new UnsafeAddressError(current.host)
    const response = await once(current, settings, options.userAgent)
    const location = response.headers.location
    if (response.status >= 300 && response.status < 400 && location !== undefined) {
      current = new URL(location, current)
      continue
    }
    return { ...response, url: current.toString() }
  }
  throw new Error('too many redirects')
}

function once(
  url: URL,
  settings: { timeoutMs: number; maxBytes: number },
  userAgent: string | undefined,
): Promise<Omit<SafeResponse, 'url'>> {
  return new Promise((resolve, reject) => {
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest
    const request = send(
      url,
      {
        method: 'GET',
        lookup: checkedLookup,
        timeout: settings.timeoutMs,
        headers: {
          'user-agent': userAgent ?? 'SurefyOS-Crawler',
          accept: 'text/html,application/xhtml+xml,text/plain,application/pdf;q=0.8,*/*;q=0.5',
        },
      },
      (response) => {
        const chunks: Buffer[] = []
        let size = 0
        response.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > settings.maxBytes) {
            request.destroy(new Error('the page is larger than the limit'))
            return
          }
          chunks.push(chunk)
        })
        response.on('end', () => {
          const headers: Record<string, string> = {}
          for (const [name, value] of Object.entries(response.headers)) {
            if (value !== undefined) headers[name] = Array.isArray(value) ? value.join(', ') : value
          }
          resolve({ status: response.statusCode ?? 0, headers, body: Buffer.concat(chunks) })
        })
        response.on('error', reject)
      },
    )
    request.on('timeout', () => {
      request.destroy(new Error('the request timed out'))
    })
    request.on('error', reject)
    request.end()
  })
}
