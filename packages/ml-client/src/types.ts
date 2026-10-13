// SPDX-License-Identifier: AGPL-3.0-only
import type { components } from './generated/schema.js'

type Schemas = components['schemas']

export type ParseDocumentRequest = Schemas['ParseDocumentRequest']
export type ParsedDocument = Schemas['ParsedDocument']
export type DocumentSection = Schemas['DocumentSection']
export type DocumentTable = Schemas['DocumentTable']
export type OcrMode = Schemas['OcrMode']
export type PiiRequest = Schemas['PiiRequest']
export type PiiType = Schemas['PiiType']
export type PiiFindingType = Schemas['PiiFindingType']
export type PiiFinding = Schemas['PiiFinding']
export type CustomPattern = Schemas['CustomPattern']
export type DetectPiiResponse = Schemas['DetectPiiResponse']
export type MaskPiiResponse = Schemas['MaskPiiResponse']
export type MlErrorEnvelope = Schemas['ErrorEnvelope']
export type MlErrorDetail = Schemas['ErrorDetail']
export type HealthStatus = Schemas['HealthStatus']
