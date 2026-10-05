// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

const signature = z.string().regex(/^[0-9a-f]{64}$/)
const expires = z.coerce.number().int().positive()

/** `GET /api/v1/files`: a download signed by `getSignedUrl`. */
export const downloadFileQuerySchema = z.object({
  key: z.string().min(1).max(1024),
  expires,
  disposition: z.string().max(500).optional(),
  signature,
})
export type DownloadFileQuery = z.infer<typeof downloadFileQuerySchema>

/** `PUT /api/v1/files`: an upload signed by `getSignedUploadUrl`; the body is the file. */
export const uploadFileQuerySchema = z.object({
  key: z.string().min(1).max(1024),
  expires,
  contentType: z.string().min(1).max(255),
  size: z.coerce.number().int().positive(),
  signature,
})
export type UploadFileQuery = z.infer<typeof uploadFileQuerySchema>

const TAGS = ['files']

export const downloadFileRoute = {
  tags: TAGS,
  summary: 'Download a file through a signed link (local storage only)',
  querystring: downloadFileQuerySchema,
}

export const uploadFileRoute = {
  tags: TAGS,
  summary: 'Upload a file through a signed link (local storage only)',
  querystring: uploadFileQuerySchema,
}
