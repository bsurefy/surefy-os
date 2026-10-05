// SPDX-License-Identifier: AGPL-3.0-only
import { getTranslations } from 'next-intl/server'

import { authApi } from '@/api/auth'
import { AcceptInvitation } from '@/modules/Auth'
import { getSession } from '@surefy/web-core/auth/server'
import { isApiError } from '@surefy/web-core/errors'
import { getServerHttpClient } from '@surefy/web-core/http/server'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.acceptInvitation')
  return { title: t('metaTitle') }
}

/** A link that matches no invitation (or is not even a token) shows the same "not found" state. */
async function getInvitation(token: string) {
  try {
    return await authApi.invitation(await getServerHttpClient(), token)
  } catch (error) {
    if (isApiError(error) && (error.status === 404 || error.status === 400)) return null
    throw error
  }
}

export default async function InvitePage({
  params,
}: Readonly<{ params: Promise<{ token: string }> }>) {
  const { token } = await params
  const [invitation, session] = await Promise.all([getInvitation(token), getSession()])
  return (
    <AcceptInvitation
      token={token}
      invitation={invitation}
      signedInAs={
        session
          ? { email: session.user.email, isTwoFactorEnabled: session.user.twoFactorEnabled }
          : null
      }
    />
  )
}
