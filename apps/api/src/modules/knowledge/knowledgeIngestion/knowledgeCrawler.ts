// SPDX-License-Identifier: AGPL-3.0-only
import type { KnowledgeLinkConfig, KnowledgeLinkRefresh } from '@surefy/contracts'

import type { SafeGet } from './safeFetch.js'

/** Pages one crawl keeps, whatever the depth: a site's index can be far larger than a knowledge base needs. */
export const CRAWL_MAX_PAGES = 200

/** Seconds between two requests to one site. */
export const CRAWL_DELAY_MS = 250

const HTML_TYPES = ['text/html', 'application/xhtml+xml']
const READABLE_TYPES = [...HTML_TYPES, 'text/plain', 'text/markdown', 'application/pdf']

export interface CrawledPage {
  /** Canonical address: the document's `external_ref`. */
  url: string
  title: string | null
  mimeType: string
  bytes: Buffer
}

export class LinkUnreachableError extends Error {
  constructor(url: string) {
    super(`the link could not be reached: ${url}`)
  }
}

/** Fragments and trailing slashes do not make another page; the query string does. */
export function canonicalUrl(raw: string, base?: string): string | null {
  try {
    const url = new URL(raw, base)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    url.hash = ''
    url.hostname = url.hostname.toLowerCase()
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.slice(0, -1)
    }
    return url.toString()
  } catch {
    return null
  }
}

const withoutWww = (host: string): string => (host.startsWith('www.') ? host.slice(4) : host)

/** Same site: the same host, ignoring a leading `www.`. */
export const sameSite = (a: string, b: string): boolean =>
  withoutWww(new URL(a).hostname) === withoutWww(new URL(b).hostname)

/** `/docs/*` matches below `/docs/`; a rule without `*` matches that path and everything under it. */
export function pathMatches(rule: string, pathname: string): boolean {
  const pattern = rule.startsWith('/') ? rule : `/${rule}`
  if (!pattern.includes('*')) {
    return (
      pathname === pattern || pathname.startsWith(pattern.endsWith('/') ? pattern : `${pattern}/`)
    )
  }
  const regex = new RegExp(
    `^${pattern
      .split('*')
      .map((part) => part.replaceAll(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')}`,
  )
  return regex.test(pathname)
}

/** Include rules (when any) must match and exclude rules must not. The starting page always passes. */
export function pathAllowed(
  url: string,
  config: Pick<KnowledgeLinkConfig, 'includePaths' | 'excludePaths'>,
): boolean {
  const { pathname } = new URL(url)
  if (config.excludePaths.some((rule) => pathMatches(rule, pathname))) return false
  return (
    config.includePaths.length === 0 ||
    config.includePaths.some((rule) => pathMatches(rule, pathname))
  )
}

const HREF = /<a\s[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi

/** The addresses a page links to, resolved against the page and made canonical. */
export function extractLinks(html: string, pageUrl: string): string[] {
  const links = new Set<string>()
  for (const match of html.matchAll(HREF)) {
    const href = (match[1] ?? match[2] ?? match[3] ?? '').trim()
    if (href === '' || /^(mailto:|tel:|javascript:)/i.test(href)) continue
    const url = canonicalUrl(href, pageUrl)
    if (url !== null) links.add(url)
  }
  return [...links]
}

export function extractTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  const title = match?.[1]?.replaceAll(/\s+/g, ' ').trim()
  return title === undefined || title === '' ? null : title.slice(0, 300)
}

/** `field: value` lines of a robots.txt, comments and malformed lines dropped. */
function robotsLines(robots: string): { field: string; value: string }[] {
  return robots.split(/\r?\n/).flatMap((raw) => {
    const line = raw.replace(/#.*/, '').trim()
    const separator = line.indexOf(':')
    return separator < 0
      ? []
      : [
          {
            field: line.slice(0, separator).trim().toLowerCase(),
            value: line.slice(separator + 1).trim(),
          },
        ]
  })
}

const appliesToUs = (agent: string): boolean =>
  agent === '*' || agent.toLowerCase().includes('surefyos')

/** The `Disallow` paths that apply to every crawler (or to ours) in a robots.txt. */
export function robotsDisallowed(robots: string): string[] {
  const rules: string[] = []
  let applies = false
  let inAgentGroup = false
  for (const { field, value } of robotsLines(robots)) {
    if (field === 'user-agent') {
      // consecutive User-agent lines share one group; a new group starts after a rule
      applies = inAgentGroup ? applies || appliesToUs(value) : appliesToUs(value)
      inAgentGroup = true
      continue
    }
    inAgentGroup = false
    if (field === 'disallow' && applies && value !== '') rules.push(value)
  }
  return rules
}

const mimeOf = (contentType: string | undefined): string =>
  (contentType ?? 'text/html').split(';')[0]?.trim().toLowerCase() ?? 'text/html'

export interface CrawlOptions {
  get: SafeGet
  sleep?: (ms: number) => Promise<void>
  maxPages?: number
}

/** One page: null for a page that cannot be used; the starting page must be usable. */
async function fetchPage(url: string, root: string, get: SafeGet): Promise<CrawledPage | null> {
  let response
  try {
    response = await get(url)
  } catch {
    response = undefined
  }
  const mimeType = mimeOf(response?.headers['content-type'])
  if (
    response === undefined ||
    response.status < 200 ||
    response.status >= 300 ||
    !READABLE_TYPES.includes(mimeType)
  ) {
    if (url === root) throw new LinkUnreachableError(url)
    return null
  }
  return {
    url: canonicalUrl(response.url) ?? url,
    title: HTML_TYPES.includes(mimeType) ? extractTitle(response.body.toString('utf8')) : null,
    mimeType,
    bytes: response.body,
  }
}

/** The links of a page worth following: same site, allowed by the rules and robots.txt, new. */
function followable(
  page: CrawledPage,
  root: string,
  config: KnowledgeLinkConfig,
  disallowed: readonly string[],
  seen: Set<string>,
): string[] {
  if (!HTML_TYPES.includes(page.mimeType)) return []
  const found: string[] = []
  for (const link of extractLinks(page.bytes.toString('utf8'), page.url)) {
    const allowed =
      !seen.has(link) &&
      sameSite(root, link) &&
      pathAllowed(link, config) &&
      !disallowed.some((rule) => new URL(link).pathname.startsWith(rule))
    if (!allowed) continue
    seen.add(link)
    found.push(link)
  }
  return found
}

/**
 * Breadth-first crawl of one site from the link's address, to the configured depth, within the
 * include and exclude paths and the site's robots.txt. A page that cannot be fetched is skipped;
 * only an unreachable starting page fails the crawl.
 */
export async function crawl(
  config: KnowledgeLinkConfig,
  options: CrawlOptions,
): Promise<CrawledPage[]> {
  const root = canonicalUrl(config.url)
  if (root === null) throw new LinkUnreachableError(config.url)
  const sleep = options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const maxPages = options.maxPages ?? CRAWL_MAX_PAGES
  const disallowed = await fetchDisallowed(root, options.get)

  const pages: CrawledPage[] = []
  const seen = new Set([root])
  let level = [root]
  for (let depth = 0; depth <= config.crawlDepth && level.length > 0; depth += 1) {
    const next: string[] = []
    for (const url of level) {
      if (pages.length >= maxPages) return pages
      const page = await fetchPage(url, root, options.get)
      if (page === null) continue
      pages.push(page)
      if (depth < config.crawlDepth) next.push(...followable(page, root, config, disallowed, seen))
      await pause(config.crawlDepth, sleep)
    }
    level = next
  }
  return pages
}

/** A short pause between requests to one site, only when more than the starting page is fetched. */
const pause = (crawlDepth: number, sleep: (ms: number) => Promise<void>): Promise<void> =>
  crawlDepth > 0 ? sleep(CRAWL_DELAY_MS) : Promise.resolve()

async function fetchDisallowed(root: string, get: SafeGet): Promise<string[]> {
  try {
    const response = await get(new URL('/robots.txt', root).toString(), { maxBytes: 512 * 1024 })
    return response.status === 200 ? robotsDisallowed(response.body.toString('utf8')) : []
  } catch {
    return []
  }
}

const DAY_MS = 86_400_000
const REFRESH_MS: Record<Exclude<KnowledgeLinkRefresh, 'off'>, number> = {
  daily: DAY_MS,
  weekly: 7 * DAY_MS,
  monthly: 30 * DAY_MS,
}

/** When a link is crawled again; null for "off". */
export function nextSyncAfter(refresh: KnowledgeLinkRefresh, from: Date): Date | null {
  return refresh === 'off' ? null : new Date(from.getTime() + REFRESH_MS[refresh])
}
