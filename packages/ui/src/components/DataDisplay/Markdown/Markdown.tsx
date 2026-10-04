// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { cn } from '../../../lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../primitives/table'
import CodeBlock from '../CodeBlock'

import type { MarkdownProps } from './Markdown.types'
import type { ReactNode } from 'react'

const HEADING_STYLES = [
  'text-object-title',
  'text-section-title',
  'text-section-title',
  'text-label',
]

function MarkdownHeading({
  depth,
  topLevel,
  children,
}: Readonly<{ depth: number; topLevel: number; children?: ReactNode }>) {
  const Tag = `h${String(Math.min(topLevel + depth - 1, 6))}` as 'h2'
  const style = HEADING_STYLES[Math.min(depth - 1, HEADING_STYLES.length - 1)]
  return <Tag className={cn(style, 'text-foreground mt-2')}>{children}</Tag>
}

/**
 * Renders Markdown (GitHub flavor) with the design-system text styles. Raw HTML is skipped and
 * unsafe link protocols are removed; links open in a new tab.
 */
export default function Markdown({
  children,
  codeLabels,
  topHeadingLevel = 3,
  className,
}: Readonly<MarkdownProps>) {
  const components: Components = {
    h1: ({ children: text }) => (
      <MarkdownHeading depth={1} topLevel={topHeadingLevel}>
        {text}
      </MarkdownHeading>
    ),
    h2: ({ children: text }) => (
      <MarkdownHeading depth={2} topLevel={topHeadingLevel}>
        {text}
      </MarkdownHeading>
    ),
    h3: ({ children: text }) => (
      <MarkdownHeading depth={3} topLevel={topHeadingLevel}>
        {text}
      </MarkdownHeading>
    ),
    h4: ({ children: text }) => (
      <MarkdownHeading depth={4} topLevel={topHeadingLevel}>
        {text}
      </MarkdownHeading>
    ),
    h5: ({ children: text }) => (
      <MarkdownHeading depth={4} topLevel={topHeadingLevel}>
        {text}
      </MarkdownHeading>
    ),
    h6: ({ children: text }) => (
      <MarkdownHeading depth={4} topLevel={topHeadingLevel}>
        {text}
      </MarkdownHeading>
    ),
    p: ({ children: text }) => <p className="text-body text-foreground">{text}</p>,
    a: ({ children: text, href }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-2"
      >
        {text}
      </a>
    ),
    ul: ({ children: items }) => (
      <ul className="text-body flex list-disc flex-col gap-1 pl-5">{items}</ul>
    ),
    ol: ({ children: items }) => (
      <ol className="text-body flex list-decimal flex-col gap-1 pl-5">{items}</ol>
    ),
    blockquote: ({ children: quote }) => (
      <blockquote className="border-border text-foreground-secondary border-l-2 pl-3">
        {quote}
      </blockquote>
    ),
    hr: () => <hr className="border-border" />,
    // Block code arrives as <pre><code class="language-x">; inline code has no <pre>.
    pre: ({ children: block }) => <>{block}</>,
    code: ({ className: languageClass, children: code }) => {
      const language = /language-(\w+)/.exec(languageClass ?? '')?.[1]
      const text = typeof code === 'string' ? code : ''
      if (language !== undefined || text.includes('\n')) {
        return <CodeBlock code={text.replace(/\n$/, '')} language={language} labels={codeLabels} />
      }
      return <code className="bg-surface-2 text-code rounded px-1 py-0.5">{code}</code>
    },
    table: ({ children: rows }) => <Table>{rows}</Table>,
    thead: ({ children: rows }) => <TableHeader>{rows}</TableHeader>,
    tbody: ({ children: rows }) => <TableBody>{rows}</TableBody>,
    tr: ({ children: cells }) => <TableRow>{cells}</TableRow>,
    th: ({ children: text }) => <TableHead scope="col">{text}</TableHead>,
    td: ({ children: text }) => <TableCell className="whitespace-normal">{text}</TableCell>,
  }

  return (
    <div className={cn('flex min-w-0 flex-col gap-3', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
        {children}
      </ReactMarkdown>
    </div>
  )
}
