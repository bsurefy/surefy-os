// SPDX-License-Identifier: AGPL-3.0-only
/* eslint-disable sonarjs/no-hardcoded-ip -- the address classification is what is tested */
import { describe, expect, it } from 'vitest'

import type { KnowledgeLinkConfig } from '@surefy/contracts'

import {
  canonicalUrl,
  crawl,
  extractLinks,
  extractTitle,
  LinkUnreachableError,
  nextSyncAfter,
  pathAllowed,
  pathMatches,
  robotsDisallowed,
  sameSite,
} from '../knowledgeCrawler.js'
import { isPublicAddress, type SafeGet, type SafeResponse } from '../safeFetch.js'

const config = (over: Partial<KnowledgeLinkConfig> = {}): KnowledgeLinkConfig => ({
  url: 'https://docs.example.com/',
  crawlDepth: 1,
  includePaths: [],
  excludePaths: [],
  refresh: 'off',
  ...over,
})

describe('addresses', () => {
  it('canonicalizes fragments, trailing slashes and host case', () => {
    expect(canonicalUrl('https://Docs.Example.com/a/#top')).toBe('https://docs.example.com/a')
    expect(canonicalUrl('../b?x=1', 'https://docs.example.com/a/c')).toBe(
      'https://docs.example.com/b?x=1',
    )
    expect(canonicalUrl('mailto:a@b.c')).toBeNull()
    expect(canonicalUrl('not a url')).toBeNull()
  })

  it('treats www as the same site and other hosts as different', () => {
    expect(sameSite('https://example.com/a', 'https://www.example.com/b')).toBe(true)
    expect(sameSite('https://example.com', 'https://blog.example.com')).toBe(false)
  })
})

describe('path rules', () => {
  it('matches prefixes and wildcards', () => {
    expect(pathMatches('/docs', '/docs')).toBe(true)
    expect(pathMatches('/docs', '/docs/guide')).toBe(true)
    expect(pathMatches('/docs', '/documentation')).toBe(false)
    expect(pathMatches('/docs/*/v2', '/docs/api/v2')).toBe(true)
    expect(pathMatches('blog', '/blog/post')).toBe(true)
  })

  it('applies include then exclude rules', () => {
    const rules = { includePaths: ['/docs'], excludePaths: ['/docs/internal'] }
    expect(pathAllowed('https://x.test/docs/a', rules)).toBe(true)
    expect(pathAllowed('https://x.test/docs/internal/b', rules)).toBe(false)
    expect(pathAllowed('https://x.test/blog', rules)).toBe(false)
    expect(pathAllowed('https://x.test/anything', { includePaths: [], excludePaths: [] })).toBe(
      true,
    )
  })
})

describe('html', () => {
  it('extracts links in all quoting styles and skips non-pages', () => {
    const html = `<a href="/a">A</a><a href='b#x'>B</a><a href=c>C</a><a href="mailto:x@y.z">M</a><a href="javascript:void(0)">J</a>`
    expect(extractLinks(html, 'https://x.test/dir/')).toEqual([
      'https://x.test/a',
      'https://x.test/dir/b',
      'https://x.test/dir/c',
    ])
  })

  it('reads the title', () => {
    expect(extractTitle('<html><title>\n  Leave   policy </title>')).toBe('Leave policy')
    expect(extractTitle('<p>none</p>')).toBeNull()
  })

  it('reads the disallow rules that apply to every crawler', () => {
    const robots = `User-agent: Googlebot\nDisallow: /g\n\nUser-agent: *\nDisallow: /private\nDisallow:\n# c\nUser-agent: SurefyOS-Crawler\nDisallow: /s`
    expect(robotsDisallowed(robots)).toEqual(['/private', '/s'])
  })
})

describe('nextSyncAfter', () => {
  it('schedules by refresh', () => {
    const from = new Date('2026-10-01T00:00:00Z')
    expect(nextSyncAfter('off', from)).toBeNull()
    expect(nextSyncAfter('daily', from)?.toISOString()).toBe('2026-10-02T00:00:00.000Z')
    expect(nextSyncAfter('weekly', from)?.toISOString()).toBe('2026-10-08T00:00:00.000Z')
  })
})

describe('isPublicAddress', () => {
  it.each([
    ['93.184.216.34', true],
    ['2606:4700:4700::1111', true],
    ['10.0.0.5', false],
    ['127.0.0.1', false],
    ['169.254.169.254', false],
    ['192.168.1.1', false],
    ['172.20.0.1', false],
    ['100.64.0.1', false],
    ['::1', false],
    ['fe80::1', false],
    ['fd00::1', false],
    ['::ffff:10.0.0.1', false],
    ['::ffff:93.184.216.34', true],
    ['not-an-ip', false],
  ])('%s → %s', (address, expected) => {
    expect(isPublicAddress(address)).toBe(expected)
  })
})

/** A fake web: address → [status, content type, body]. */
function web(pages: Record<string, [number, string, string]>): { get: SafeGet; calls: string[] } {
  const calls: string[] = []
  const get: SafeGet = (url) => {
    calls.push(url)
    const page = pages[url]
    if (page === undefined) return Promise.reject(new Error('connection refused'))
    const [status, type, body] = page
    const response: SafeResponse = {
      status,
      headers: { 'content-type': type },
      body: Buffer.from(body),
      url,
    }
    return Promise.resolve(response)
  }
  return { get, calls }
}

const noSleep = () => Promise.resolve()

describe('crawl', () => {
  const html = (title: string, links: string[]): [number, string, string] => [
    200,
    'text/html; charset=utf-8',
    '<title>' + title + '</title>' + links.map((l) => '<a href="' + l + '">x</a>').join(''),
  ]

  it('follows same-site links to the depth, once each', async () => {
    const { get, calls } = web({
      'https://docs.example.com/': html('Home', ['/a', '/b', 'https://other.test/x', '/a']),
      'https://docs.example.com/a': html('A', ['/c']),
      'https://docs.example.com/b': html('B', []),
      'https://docs.example.com/c': html('C', []),
    })
    const pages = await crawl(config({ crawlDepth: 1 }), { get, sleep: noSleep })
    expect(pages.map((p) => p.title)).toEqual(['Home', 'A', 'B'])
    expect(calls).not.toContain('https://other.test/x')
    expect(calls).not.toContain('https://docs.example.com/c')
    const deeper = await crawl(config({ crawlDepth: 2 }), { get, sleep: noSleep })
    expect(deeper.map((p) => p.title)).toEqual(['Home', 'A', 'B', 'C'])
  })

  it('fetches one page at depth 0', async () => {
    const { get } = web({ 'https://docs.example.com/': html('Home', ['/a']) })
    const pages = await crawl(config({ crawlDepth: 0 }), { get, sleep: noSleep })
    expect(pages).toHaveLength(1)
  })

  it('obeys path rules and robots.txt, and stops at the page limit', async () => {
    const { get, calls } = web({
      'https://docs.example.com/robots.txt': [
        200,
        'text/plain',
        'User-agent: *\nDisallow: /secret',
      ],
      'https://docs.example.com/': html('Home', ['/docs/a', '/secret/x', '/blog']),
      'https://docs.example.com/docs/a': html('A', []),
      'https://docs.example.com/blog': html('Blog', []),
    })
    const pages = await crawl(config({ includePaths: ['/docs', '/secret'] }), {
      get,
      sleep: noSleep,
    })
    expect(pages.map((p) => p.title)).toEqual(['Home', 'A'])
    expect(calls).not.toContain('https://docs.example.com/secret/x')
    const limited = await crawl(config({ crawlDepth: 1 }), { get, sleep: noSleep, maxPages: 1 })
    expect(limited).toHaveLength(1)
  })

  it('skips pages that fail but fails when the starting page does', async () => {
    const { get } = web({
      'https://docs.example.com/': html('Home', ['/gone', '/ok']),
      'https://docs.example.com/gone': [404, 'text/html', ''],
      'https://docs.example.com/ok': html('Ok', []),
    })
    const pages = await crawl(config(), { get, sleep: noSleep })
    expect(pages.map((p) => p.title)).toEqual(['Home', 'Ok'])
    await expect(
      crawl(config({ url: 'https://down.test/' }), { get, sleep: noSleep }),
    ).rejects.toBeInstanceOf(LinkUnreachableError)
    const image = web({ 'https://docs.example.com/': [200, 'image/png', 'x'] })
    await expect(crawl(config(), { get: image.get, sleep: noSleep })).rejects.toBeInstanceOf(
      LinkUnreachableError,
    )
  })
})
