// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

/** Single-server self-host: files on a mounted volume, served through signed API routes. */
export const localStorageEnvSchema = z.object({
  STORAGE_DRIVER: z.literal('local'),
  STORAGE_LOCAL_PATH: z.string().min(1).default('./data/storage'),
})

/** Any S3-compatible service: AWS S3, Cloudflare R2, MinIO. */
export const s3EnvSchema = z.object({
  STORAGE_DRIVER: z.literal('s3'),
  STORAGE_S3_BUCKET: z.string().min(1),
  STORAGE_S3_REGION: z.string().default('auto'),
  STORAGE_S3_ENDPOINT: z.url().optional(),
  STORAGE_S3_FORCE_PATH_STYLE: z.stringbool().default(false), // MinIO and most self-hosted services
  STORAGE_S3_ACCESS_KEY_ID: z.string().min(1),
  STORAGE_S3_SECRET_ACCESS_KEY: z.string().min(1),
})

/** Variables of the selected driver only (discriminated on STORAGE_DRIVER). */
export const storageEnvSchema = z.discriminatedUnion('STORAGE_DRIVER', [
  localStorageEnvSchema,
  s3EnvSchema,
])
export type StorageEnv = z.infer<typeof storageEnvSchema>
