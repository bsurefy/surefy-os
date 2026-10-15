// SPDX-License-Identifier: AGPL-3.0-only

// Notion blocks and properties as Markdown, which the parser reads with its headings, lists and
// tables, so passages keep the page's structure. Child pages and databases are documents of their
// own and are left out here; media blocks keep only their caption.

export interface NotionRichText {
  plain_text?: unknown
  href?: unknown
  annotations?: { bold?: unknown; italic?: unknown; code?: unknown; strikethrough?: unknown }
}

/** A block with its children already loaded (`children`), as the connector walks them. */
export interface NotionBlock {
  type?: unknown
  has_children?: unknown
  children?: NotionBlock[]
  [type: string]: unknown
}

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? (value as unknown[]) : [])

export function plainText(value: unknown): string {
  return asArray(value)
    .map((part) => {
      const text = (part as NotionRichText).plain_text
      return typeof text === 'string' ? text : ''
    })
    .join('')
}

function richText(value: unknown): string {
  return asArray(value)
    .map((raw) => {
      const part = raw as NotionRichText
      let text = typeof part.plain_text === 'string' ? part.plain_text : ''
      if (text === '') return ''
      const marks = part.annotations ?? {}
      if (marks.code === true) text = `\`${text}\``
      if (marks.bold === true) text = `**${text}**`
      if (marks.italic === true) text = `_${text}_`
      if (marks.strikethrough === true) text = `~~${text}~~`
      if (typeof part.href === 'string' && part.href !== '') text = `[${text}](${part.href})`
      return text
    })
    .join('')
}

const bodyOf = (block: NotionBlock): Record<string, unknown> => {
  const type = typeof block.type === 'string' ? block.type : ''
  const body = block[type]
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
}

const indent = (text: string, by: string): string =>
  text
    .split('\n')
    .map((line) => (line === '' ? line : `${by}${line}`))
    .join('\n')

function tableOf(block: NotionBlock): string {
  const rows = (block.children ?? []).map((row) =>
    asArray(bodyOf(row).cells).map((cell) => richText(cell).replaceAll('|', '\\|')),
  )
  const [head, ...rest] = rows
  if (head === undefined) return ''
  const line = (cells: string[]) => `| ${cells.join(' | ')} |`
  return [line(head), line(head.map(() => '---')), ...rest.map(line)].join('\n')
}

function blockText(block: NotionBlock, number: number): string | null {
  const body = bodyOf(block)
  const text = richText(body.rich_text)
  const caption = richText(body.caption)
  switch (block.type) {
    case 'paragraph':
      return text
    case 'heading_1':
      return `# ${text}`
    case 'heading_2':
      return `## ${text}`
    case 'heading_3':
      return `### ${text}`
    case 'bulleted_list_item':
    case 'toggle':
      return `- ${text}`
    case 'numbered_list_item':
      return `${String(number)}. ${text}`
    case 'to_do':
      return `- [${body.checked === true ? 'x' : ' '}] ${text}`
    case 'quote':
    case 'callout':
      return `> ${text}`
    case 'code':
      return `\`\`\`${typeof body.language === 'string' ? body.language : ''}\n${plainText(body.rich_text)}\n\`\`\``
    case 'equation':
      return typeof body.expression === 'string' ? `$$${body.expression}$$` : null
    case 'divider':
      return '---'
    case 'table':
      return tableOf(block)
    case 'bookmark':
    case 'embed':
    case 'link_preview':
      if (typeof body.url !== 'string') return null
      return caption === '' ? `<${body.url}>` : `<${body.url}> ${caption}`
    case 'image':
    case 'video':
    case 'file':
    case 'pdf':
    case 'audio':
      return caption === '' ? null : caption
    default:
      // child pages and databases are their own documents; columns and synced blocks are
      // containers whose children follow
      return null
  }
}

const LIST_TYPES = new Set(['bulleted_list_item', 'numbered_list_item', 'to_do', 'toggle'])

export function blocksToMarkdown(blocks: readonly NotionBlock[]): string {
  const out: string[] = []
  let number = 0
  for (const block of blocks) {
    number = block.type === 'numbered_list_item' ? number + 1 : 0
    const text = blockText(block, number)
    const children =
      block.type === 'table' || block.children === undefined ? '' : blocksToMarkdown(block.children)
    const isList = typeof block.type === 'string' && LIST_TYPES.has(block.type)
    const nested = isList ? indent(children, '  ') : children
    const joined = [text, nested].filter((part) => part !== null && part !== '').join('\n')
    if (joined !== '') out.push(joined)
  }
  return out.join('\n\n')
}

/** A database row's properties as `**Name:** value` lines; the title is the heading instead. */
export function propertiesToMarkdown(properties: Record<string, unknown>): string {
  const lines: string[] = []
  for (const [name, raw] of Object.entries(properties)) {
    const property = raw as Record<string, unknown>
    const value = propertyValue(property)
    if (property.type !== 'title' && value !== '') lines.push(`**${name}:** ${value}`)
  }
  return lines.join('\n')
}

function propertyValue(property: Record<string, unknown>): string {
  const type = typeof property.type === 'string' ? property.type : ''
  const value = property[type]
  switch (type) {
    case 'title':
    case 'rich_text':
      return plainText(value)
    case 'number':
      return typeof value === 'number' ? String(value) : ''
    case 'checkbox':
      return value === true ? 'Yes' : 'No'
    case 'url':
    case 'email':
    case 'phone_number':
      return typeof value === 'string' ? value : ''
    case 'select':
    case 'status': {
      const name = (value as { name?: unknown } | null)?.name
      return typeof name === 'string' ? name : ''
    }
    case 'multi_select':
      return asArray(value)
        .map((option) => (option as { name?: unknown }).name)
        .filter((name): name is string => typeof name === 'string')
        .join(', ')
    case 'date': {
      const date = value as { start?: unknown; end?: unknown } | null
      if (typeof date?.start !== 'string') return ''
      return typeof date.end === 'string' ? `${date.start} – ${date.end}` : date.start
    }
    default:
      return ''
  }
}

/** A page's title: its `title` property (pages in a database name theirs). */
export function pageTitle(properties: unknown): string | null {
  if (typeof properties !== 'object' || properties === null) return null
  for (const raw of Object.values(properties as Record<string, unknown>)) {
    const property = raw as Record<string, unknown>
    if (property.type === 'title') {
      const title = plainText(property.title).trim()
      return title === '' ? null : title
    }
  }
  return null
}
