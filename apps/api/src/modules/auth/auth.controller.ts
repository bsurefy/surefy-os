// SPDX-License-Identifier: AGPL-3.0-only
import type {
  getMeRoute,
  listSessionsRoute,
  revokeOtherSessionsRoute,
  revokeSessionRoute,
  signInOptionsRoute,
  updateMeRoute,
} from './auth.schema.js'
import type { AuthService } from './auth.service.js'
import type { ZodReply, ZodRequest } from '@/types/fastify.js'

type GetMe = typeof getMeRoute
type UpdateMe = typeof updateMeRoute
type ListSessions = typeof listSessionsRoute
type RevokeSession = typeof revokeSessionRoute
type RevokeOtherSessions = typeof revokeOtherSessionsRoute
type SignInOptions = typeof signInOptionsRoute

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  me = async (request: ZodRequest<GetMe>, reply: ZodReply<GetMe>) => {
    reply.ok(await this.authService.me(request.auth))
  }

  updateMe = async (request: ZodRequest<UpdateMe>, reply: ZodReply<UpdateMe>) => {
    reply.ok(await this.authService.updateMe(request.auth, request.body))
  }

  listSessions = async (request: ZodRequest<ListSessions>, reply: ZodReply<ListSessions>) => {
    reply.ok(await this.authService.listSessions(request.auth))
  }

  revokeSession = async (request: ZodRequest<RevokeSession>, reply: ZodReply<RevokeSession>) => {
    await this.authService.revokeSession(request.auth, request.params.sessionId)
    reply.noContent()
  }

  revokeOtherSessions = async (
    request: ZodRequest<RevokeOtherSessions>,
    reply: ZodReply<RevokeOtherSessions>,
  ) => {
    reply.ok(await this.authService.revokeOtherSessions(request.auth))
  }

  signInOptions = async (_request: ZodRequest<SignInOptions>, reply: ZodReply<SignInOptions>) => {
    reply.ok(await this.authService.signInOptions())
  }
}
