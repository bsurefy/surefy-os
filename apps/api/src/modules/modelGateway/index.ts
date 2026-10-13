// SPDX-License-Identifier: AGPL-3.0-only
export {
  createModelGatewayModule,
  logUsageRecorder,
  type ModelGatewayModule,
} from './modelGateway.module.js'
export { ModelNotAllowedError, ModelProviderUnavailableError } from './modelGateway.errors.js'
export type { DecisionValue, GatewayDecisionRequest } from './modelGateway.decision.js'
export type {
  GatewayDecisionResult,
  GatewayEmbedResult,
  GatewayStream,
  GatewayStreamRequest,
  GatewayTextRequest,
  GatewayTextResult,
  ModelGatewayService,
} from './modelGateway.service.js'
export type {
  ModelCallContext,
  ModelCallGuard,
  ModelCallMeter,
  ModelCallRecord,
  ModelSource,
  ResolvedModel,
  UsageRecorder,
} from './modelGateway.types.js'
