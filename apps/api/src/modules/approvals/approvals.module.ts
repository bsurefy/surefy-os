// SPDX-License-Identifier: AGPL-3.0-only
import { ApprovalsController } from './approvals.controller.js'
import { createTimeoutsJob } from './approvals.jobs.js'
import {
  createApprovalsMemberRemoval,
  createApprovalsTeamDeletion,
} from './approvals.memberRemoval.js'
import { createApprovalHandlers } from './approvals.outbox.js'
import { ApprovalPresenter } from './approvals.presenter.js'
import { ApprovalsRepository } from './approvals.repository.js'
import { approvalsRoutes } from './approvals.routes.js'
import { ApprovalsService } from './approvals.service.js'
import { ApprovalTimeouts } from './approvals.timeouts.js'
import { DEFAULT_GUARD, DEFAULT_SUBJECTS } from './approvals.types.js'

import type {
  ApprovalSubjects,
  ApprovalsAccess,
  ApprovalsGuard,
  ApprovalsNotifier,
  ApprovalsOutbox,
  ApprovalsTeams,
  ApprovalsUserRefs,
} from './approvals.types.js'
import type { Database } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'

export interface ApprovalsModuleDeps {
  db: Database
  logger: Logger
  access: ApprovalsAccess
  teams: ApprovalsTeams
  users: ApprovalsUserRefs
  notifications: ApprovalsNotifier
  /** The outbox service; read when an event is written, because the outbox is built after this. */
  outbox: () => ApprovalsOutbox
  audit: AuditRecorder
  /** Guard settings and rule names; the defaults apply until the `guard` module provides them. */
  guard?: ApprovalsGuard
  /** Agent and flow names and access; none until `agents` and `flows` provide them. */
  subjects?: ApprovalSubjects
}

/** Approvals: the queue, decisions with step-up, timeouts, notifications and the resume events. */
export function createApprovalsModule(deps: ApprovalsModuleDeps) {
  const repository = new ApprovalsRepository()
  const guard = deps.guard ?? DEFAULT_GUARD
  const subjects = deps.subjects ?? DEFAULT_SUBJECTS
  // events are written through the outbox, which is built after the modules that handle them
  const outbox: ApprovalsOutbox = {
    write: (tx, event) => deps.outbox().write(tx, event),
    kick: () => deps.outbox().kick(),
  }
  const presenter = new ApprovalPresenter({
    repository,
    users: deps.users,
    teams: deps.teams,
    subjects,
    guard,
  })
  const service = new ApprovalsService({
    db: deps.db,
    repository,
    presenter,
    access: deps.access,
    guard,
    subjects,
    users: deps.users,
    audit: deps.audit,
    outbox,
  })
  const timeouts = new ApprovalTimeouts({
    db: deps.db,
    repository,
    guard,
    audit: deps.audit,
    outbox,
    logger: deps.logger,
  })
  return {
    /** Guard, the bridge and agent publishing create approvals through `service.create`. */
    service,
    timeouts,
    jobs: [createTimeoutsJob(timeouts)],
    outboxHandlers: createApprovalHandlers({
      db: deps.db,
      repository,
      notifications: deps.notifications,
      logger: deps.logger,
    }),
    /** Removing a member or deleting a team never leaves an approval without a decider. */
    memberRemoval: createApprovalsMemberRemoval(service),
    teamDeletion: createApprovalsTeamDeletion(service),
    routes: approvalsRoutes(new ApprovalsController(service)),
  }
}
export type ApprovalsModule = ReturnType<typeof createApprovalsModule>
