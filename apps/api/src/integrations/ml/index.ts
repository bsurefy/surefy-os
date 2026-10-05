// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

/** A parsed document as the ML service returns it (`POST /v1/documents/parse`). */
const parsedDocumentSchema = z.object({
  pages: z.number().int().nonnegative(),
  sections: z.array(z.object({ text: z.string() })),
  tables: z.array(z.object({ rows: z.array(z.array(z.string())) })),
})
export type ParsedDocument = z.infer<typeof parsedDocumentSchema>

export interface ParseDocumentInput {
  /** A signed URL the ML service downloads the file from. */
  fileUrl: string
  mimeType: string
  orgId: string
  signal?: AbortSignal
}

/** What the backend asks of the internal ML service; the Python service is never called directly. */
export interface MlDocuments {
  parseDocument(input: ParseDocumentInput): Promise<ParsedDocument>
}

export class MlServiceError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'MlServiceError'
  }
}

export interface MlDocumentsOptions {
  /** `ML_SERVICE_URL` */
  url: string
  /** `ML_SERVICE_TOKEN`, sent as a bearer token */
  token: string
  fetch?: typeof globalThis.fetch
}

export function createMlDocuments(options: MlDocumentsOptions): MlDocuments {
  const call = options.fetch ?? globalThis.fetch
  return {
    async parseDocument({ signal, ...body }) {
      const response = await call(new URL('/v1/documents/parse', options.url), {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        ...(signal === undefined ? {} : { signal }),
      })
      if (!response.ok) throw new MlServiceError(response.status, 'document parse failed')
      return parsedDocumentSchema.parse(await response.json())
    },
  }
}
