// SPDX-License-Identifier: AGPL-3.0-only
import type { components } from './generated/schema'

type Schemas = components['schemas']

export type ParseDocumentRequest = Schemas['ParseDocumentRequest']
export type ParsedDocument = Schemas['ParsedDocument']
export type DocumentSection = Schemas['DocumentSection']
export type DocumentTable = Schemas['DocumentTable']
export type OcrMode = Schemas['OcrMode']
export type MlErrorEnvelope = Schemas['ErrorEnvelope']
export type MlErrorDetail = Schemas['ErrorDetail']
export type HealthStatus = Schemas['HealthStatus']
