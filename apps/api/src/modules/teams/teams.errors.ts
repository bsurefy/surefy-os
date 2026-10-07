// SPDX-License-Identifier: AGPL-3.0-only
import { ConflictError, NotFoundError, UnprocessableError } from '@/core/errors/index.js'
import { ERROR_CODES } from '@surefy/contracts'

export class TeamNotFoundError extends NotFoundError {
  constructor() {
    super(ERROR_CODES.TEAM_NOT_FOUND, 'Team not found')
  }
}

/** Team names are unique per organization, case-insensitive. */
export class TeamNameTakenError extends ConflictError {
  constructor() {
    super(ERROR_CODES.TEAM_NAME_TAKEN, 'A team with this name already exists')
  }
}

export class TeamLeadOutsideTeamError extends UnprocessableError {
  constructor() {
    super(ERROR_CODES.TEAM_LEAD_NOT_A_MEMBER, 'The team lead must be a member of the team')
  }
}

export class TeamMemberNotFoundError extends NotFoundError {
  constructor() {
    super(ERROR_CODES.TEAM_MEMBER_NOT_FOUND, 'This person is not in the team')
  }
}

/** Only active members of the organization join teams. */
export class TeamCandidateNotMemberError extends NotFoundError {
  constructor() {
    super(ERROR_CODES.MEMBER_NOT_FOUND, 'Member not found')
  }
}
