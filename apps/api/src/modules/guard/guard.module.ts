// SPDX-License-Identifier: AGPL-3.0-only
import { createApprovalsGuard } from './guard.approvalsPort.js'
import { GuardController } from './guard.controller.js'
import { GuardEngine } from './guard.engine.js'
import { GuardrailsService } from './guard.guardrails.service.js'
import { createStatsRollupJob } from './guard.jobs.js'
import { LimitCounters } from './guard.limits.js'
import { createGuardHandlers } from './guard.outbox.js'
import { PiiFilter } from './guard.pii.js'
import { PiiRulesService } from './guard.piiRules.service.js'
import { GuardRefsLoader } from './guard.presenter.js'
import { GuardRepository } from './guard.repository.js'
import { guardRoutes } from './guard.routes.js'
import { GuardRuleSets } from './guard.ruleSet.js'
import { GuardSettingsService } from './guard.settings.service.js'
import { GuardStats } from './guard.stats.js'
import { EMPTY_SUBJECTS } from './guard.types.js'

import type {
  GuardApprovals,
  GuardModelDecider,
  GuardOutbox,
  GuardPiiService,
  GuardSubjects,
  GuardTeams,
  GuardUserRefs,
} from './guard.types.js'
import type { Cache } from '@/core/cache/index.js'
import type { Database } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'

/**
 * What the approvals module reads from Guard, built first because Guard creates approvals and so
 * is built after it. Both share the repository and the subjects.
 */
export function createGuardApprovalsPort(subjects: GuardSubjects = EMPTY_SUBJECTS) {
  const repository = new GuardRepository()
  return { repository, subjects, approvalsGuard: createApprovalsGuard({ repository, subjects }) }
}
export type GuardApprovalsPort = ReturnType<typeof createGuardApprovalsPort>

export interface GuardModuleDeps {
  db: Database
  cache: Cache
  logger: Logger
  /** From `createGuardApprovalsPort`: the repository and subjects the approvals module already uses. */
  port: GuardApprovalsPort
  teams: GuardTeams
  users: GuardUserRefs
  audit: AuditRecorder
  /** Creates the approvals a check asks for. */
  approvals: GuardApprovals
  /** The model gateway's decision mode, for the double check. */
  decider: GuardModelDecider
  /** The ML service, for the personal-data filter. */
  ml: GuardPiiService
  /** The outbox service; read when an event is written, because the outbox is built after this. */
  outbox: () => GuardOutbox
}

/**
 * Guard: the organization's defaults, guardrails and data filters, the evaluation engine the agent
 * executor calls for every tool action, and the personal-data filter the model gateway and web
 * search call before data leaves.
 */
export function createGuardModule(deps: GuardModuleDeps) {
  const { repository, subjects } = deps.port
  const outbox: GuardOutbox = {
    write: (tx, event) => deps.outbox().write(tx, event),
    kick: () => deps.outbox().kick(),
  }
  const ruleSets = new GuardRuleSets({ db: deps.db, cache: deps.cache, repository })
  const refs = new GuardRefsLoader(deps.users, deps.teams, subjects)
  const settings = new GuardSettingsService({
    db: deps.db,
    repository,
    ruleSets,
    refs,
    subjects,
    audit: deps.audit,
    outbox,
  })
  const guardrails = new GuardrailsService({
    db: deps.db,
    repository,
    ruleSets,
    refs,
    teams: deps.teams,
    subjects,
    audit: deps.audit,
    outbox,
  })
  const piiRules = new PiiRulesService({
    db: deps.db,
    repository,
    ruleSets,
    refs,
    teams: deps.teams,
    ml: deps.ml,
    audit: deps.audit,
    outbox,
  })
  const engine = new GuardEngine({
    db: deps.db,
    ruleSets,
    counters: new LimitCounters(deps.cache),
    approvals: deps.approvals,
    decider: deps.decider,
    audit: deps.audit,
    logger: deps.logger,
  })
  const piiFilter = new PiiFilter({ ruleSets, ml: deps.ml })
  const stats = new GuardStats({ db: deps.db, repository, subjects })
  return {
    /** The executor's `guard.check`. */
    engine,
    /** The model gateway's and web search's personal-data filter. */
    piiFilter,
    /** Defaults, overview and `assertNotLooser` for the agent editor. */
    settings,
    guardrails,
    piiRules,
    stats,
    jobs: [createStatsRollupJob(stats)],
    outboxHandlers: createGuardHandlers({ ruleSets }),
    routes: guardRoutes(new GuardController(settings, guardrails, piiRules)),
  }
}
export type GuardModule = ReturnType<typeof createGuardModule>
