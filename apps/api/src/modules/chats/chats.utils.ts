// SPDX-License-Identifier: AGPL-3.0-only
import { createHash, createHmac, hkdfSync, timingSafeEqual } from 'node:crypto'

import {
  CHAT_ATTACHMENT_LIMITS,
  CHAT_IMAGE_TYPES,
  CHAT_PARTS_MAX_BYTES,
  CHAT_PARTS_VERSION,
  CHAT_RESTORE_WINDOW_DAYS,
} from '@surefy/contracts'
import type {
  ChatAttachmentKind,
  ChatMessagePart,
  ChatMessageParts,
  SourcePart,
} from '@surefy/contracts'

import { GENERATED_TITLE_MAX_CHARS } from './chats.constants.js'

const DAY_MS = 86_400_000

export const emptyParts = (parts: ChatMessagePart[] = []): ChatMessageParts => ({
  version: CHAT_PARTS_VERSION,
  parts,
})

/** The plain text of the `text` parts: what search, export and Train read. */
export function contentTextOf(parts: readonly ChatMessagePart[]): string {
  return parts
    .flatMap((part) => (part.type === 'text' ? [part.text] : []))
    .join('')
    .trim()
}

/** The attachment kind of a content type, or null for a type that is not accepted. */
export function attachmentKindOf(contentType: string): ChatAttachmentKind | null {
  if ((CHAT_IMAGE_TYPES as readonly string[]).includes(contentType)) return 'image'
  return CHAT_DOCUMENT_TYPE_SET.has(contentType) ? 'document' : null
}
const CHAT_DOCUMENT_TYPE_SET: ReadonlySet<string> = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'text/csv',
])

export const maxBytesOf = (kind: ChatAttachmentKind): number =>
  kind === 'image' ? CHAT_ATTACHMENT_LIMITS.maxImageBytes : CHAT_ATTACHMENT_LIMITS.maxDocumentBytes

/** When a chat deleted at `deletedAt` is removed for good. */
export const purgeAtOf = (deletedAt: Date): Date =>
  new Date(deletedAt.getTime() + CHAT_RESTORE_WINDOW_DAYS * DAY_MS)

/** Whether a chat deleted at `deletedAt` can still be restored at `now`. */
export const isRestorable = (deletedAt: Date, now = Date.now()): boolean =>
  purgeAtOf(deletedAt).getTime() > now

/** A title from the person's first message, used when the model cannot name the chat. */
export function fallbackTitle(text: string): string {
  const line = text.replaceAll(/\s+/g, ' ').trim()
  return line.length <= GENERATED_TITLE_MAX_CHARS
    ? line
    : `${line.slice(0, GENERATED_TITLE_MAX_CHARS - 1).trimEnd()}…`
}

/** What a model returned as a title, cleaned: one line, no quotes or trailing dot, at most 80 characters. */
export function cleanTitle(raw: string): string {
  const line = raw.split('\n').find((candidate) => candidate.trim() !== '') ?? ''
  return fallbackTitle(trimTitleMarks(line))
}

const TITLE_MARKS = new Set(['"', "'", '“', '”', '‘', '’', '`', '#', '*', ' ', '\t'])

/** Quotes, markdown marks and a trailing dot around a title the model returned. */
function trimTitleMarks(line: string): string {
  let start = 0
  let end = line.length
  while (start < end && TITLE_MARKS.has(line.charAt(start))) start++
  while (end > start && (TITLE_MARKS.has(line.charAt(end - 1)) || line.charAt(end - 1) === '.'))
    end--
  return line.slice(start, end)
}

/**
 * Cuts the parts to the serialized cap: tool outputs and source snippets go first, then the text
 * is kept as it is (a 256 KiB answer is longer than any model returns).
 */
export function fitParts(parts: ChatMessageParts): ChatMessageParts {
  if (Buffer.byteLength(JSON.stringify(parts)) <= CHAT_PARTS_MAX_BYTES) return parts
  const slim = parts.parts.map((part): ChatMessagePart => {
    if (part.type === 'tool') {
      return { ...part, output: undefined }
    }
    if (part.type === 'source') return { ...part, snippet: part.snippet.slice(0, 200) }
    return part
  })
  return { ...parts, parts: slim }
}

// ── Signed upload URLs ─────────────────────────────────────────────────────────────────────────

/** The signing key of upload URLs, derived from `ENCRYPTION_KEY` and never used directly. */
export const deriveUploadKey = (encryptionKey: string): Buffer =>
  Buffer.from(
    hkdfSync('sha256', Buffer.from(encryptionKey, 'base64'), '', 'surefy:chat-upload-url:v1', 32),
  )

/**
 * The token of a signed upload URL: an HMAC over the attachment, its size and the expiry, so the
 * URL works for exactly one announced upload and expires on its own.
 */
export function signUpload(
  key: Buffer,
  upload: { orgId: string; attachmentId: string; sizeBytes: number; expires: number },
): string {
  return createHmac('sha256', key)
    .update(`${upload.orgId}\n${upload.attachmentId}\n${upload.sizeBytes}\n${upload.expires}`)
    .digest('hex')
}

export function verifyUpload(
  key: Buffer,
  upload: { orgId: string; attachmentId: string; sizeBytes: number; expires: number },
  signature: string,
  now = Date.now(),
): boolean {
  if (!Number.isInteger(upload.expires) || upload.expires * 1000 < now) return false
  const expected = Buffer.from(signUpload(key, upload), 'hex')
  const given = Buffer.from(signature, 'hex')
  return expected.length === given.length && timingSafeEqual(expected, given)
}

export const sha256Of = (bytes: Buffer): Buffer => createHash('sha256').update(bytes).digest()

// ── Content type from the bytes ────────────────────────────────────────────────────────────────

const startsWith = (bytes: Buffer, signature: readonly number[], offset = 0): boolean =>
  signature.every((byte, index) => bytes[offset + index] === byte)

/**
 * The content type the bytes really are, for the types a chat accepts. Text types have no
 * signature: they are accepted when the bytes are valid UTF-8 without NUL bytes.
 */
export function sniffContentType(bytes: Buffer, announced: string): string | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'image/gif'
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return 'image/webp'
  }
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return 'application/pdf' // %PDF
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    // a zip: a Word document when it holds the document part
    return bytes.includes('word/')
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : null
  }
  if (announced.startsWith('text/') && !bytes.includes(0)) {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      return announced
    } catch {
      return null
    }
  }
  return null
}

// ── Prompt building ────────────────────────────────────────────────────────────────────────────

/** The numbered sources block of the system prompt. */
export function sourcesBlock(
  sources: readonly Pick<SourcePart, 'index' | 'title' | 'snippet'>[],
): string {
  return sources
    .map((source) => `[${source.index}] ${source.title}\n${source.snippet}`)
    .join('\n\n')
}
