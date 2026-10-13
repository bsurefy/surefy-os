// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest'

import { appendRichText, linkTo } from './text.js'

const render = (text: string) => {
  const node = document.createElement('div')
  appendRichText(node, text)
  return node
}

describe('answer text', () => {
  it('never renders HTML from an answer', () => {
    const node = render('<img src=x onerror="alert(1)"> <b>bold</b>')
    expect(node.querySelector('img, b')).toBeNull()
    expect(node.textContent).toBe('<img src=x onerror="alert(1)"> <b>bold</b>')
  })

  it('keeps line breaks and turns web addresses into safe links', () => {
    const node = render('See https://example.com/refunds.\nThanks')
    const link = node.querySelector('a')
    expect(link?.getAttribute('href')).toBe('https://example.com/refunds')
    expect(link?.target).toBe('_blank')
    expect(link?.rel).toBe('noopener noreferrer nofollow')
    expect(node.querySelectorAll('br')).toHaveLength(1)
    expect(node.textContent).toBe('See https://example.com/refunds.Thanks')
  })

  it('links only http and https addresses', () => {
    expect(linkTo('javascript:alert(1)', 'x')).toBeInstanceOf(Text)
    expect(linkTo('not a url', 'x')).toBeInstanceOf(Text)
    expect(linkTo('https://example.com', 'Docs')).toBeInstanceOf(HTMLAnchorElement)
  })
})
