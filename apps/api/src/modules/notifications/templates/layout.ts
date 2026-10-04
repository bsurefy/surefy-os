// SPDX-License-Identifier: AGPL-3.0-only
import type { Locale } from '@surefy/contracts'

/** The words of one email, before the shared layout is applied. Values are plain text. */
export interface EmailCopy {
  subject: string
  heading: string
  /** Paragraphs above the button. */
  intro: readonly string[]
  action: { label: string; url: string }
  /** The small print under the button. */
  footnote: string
}

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** Every value that reaches the HTML goes through here: names and links come from people. */
export const escapeHtml = (value: string): string =>
  value.replaceAll(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char)

/** A subject is one line: no line breaks (header injection), no runs of whitespace. */
const oneLine = (value: string): string => value.replaceAll(/\s+/g, ' ').trim()

/**
 * The shared layout: a single centered column with inline styles (email clients ignore
 * stylesheets), a button that also works as a plain link, and a plain-text alternative.
 */
export function renderLayout(copy: EmailCopy, appName: string, locale: Locale): RenderedEmail {
  const url = escapeHtml(copy.action.url)
  const paragraphs = copy.intro
    .map((line) => `<p style="margin:0 0 16px">${escapeHtml(line)}</p>`)
    .join('')
  const html = `<!doctype html>
<html lang="${locale}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(oneLine(copy.subject))}</title></head>
<body style="margin:0;padding:0;background:#f5f5f4">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:8px;padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1c1917">
<tr><td>
<p style="margin:0 0 24px;font-size:13px;font-weight:600;color:#57534e">${escapeHtml(appName)}</p>
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${escapeHtml(copy.heading)}</h1>
${paragraphs}
<p style="margin:24px 0"><a href="${url}" style="display:inline-block;background:#1c1917;color:#ffffff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:6px">${escapeHtml(copy.action.label)}</a></p>
<p style="margin:0 0 16px;font-size:13px;color:#57534e">${escapeHtml(copy.footnote)}</p>
<p style="margin:0;font-size:12px;color:#78716c;word-break:break-all">${url}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`
  const text = [
    copy.heading,
    '',
    ...copy.intro.flatMap((line) => [line, '']),
    `${copy.action.label}: ${copy.action.url}`,
    '',
    copy.footnote,
    '',
    `— ${appName}`,
    '',
  ].join('\n')
  return { subject: oneLine(copy.subject), html, text }
}
