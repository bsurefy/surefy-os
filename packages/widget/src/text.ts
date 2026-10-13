// SPDX-License-Identifier: MIT

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g

/**
 * Appends answer text as text nodes, line breaks and links: nothing from an answer is ever parsed
 * as HTML. Links open in a new tab without access to the page.
 */
export function appendRichText(parent: HTMLElement, text: string): void {
  for (const [lineIndex, line] of text.split('\n').entries()) {
    if (lineIndex > 0) parent.append(document.createElement('br'))
    let last = 0
    for (const match of line.matchAll(URL_PATTERN)) {
      const start = match.index
      if (start > last) parent.append(line.slice(last, start))
      parent.append(linkTo(match[0]))
      last = start + match[0].length
    }
    if (last < line.length) parent.append(line.slice(last))
  }
}

/** A safe external link; anything that is not http(s) stays text. */
export function linkTo(href: string, label = href): HTMLElement | Text {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return document.createTextNode(label)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return document.createTextNode(label)
  const link = document.createElement('a')
  link.href = url.href
  link.target = '_blank'
  link.rel = 'noopener noreferrer nofollow'
  link.textContent = label
  return link
}
