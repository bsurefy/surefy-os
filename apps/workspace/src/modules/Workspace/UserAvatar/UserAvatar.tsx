// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import type { UserRefDto } from '@surefy/contracts'
import { Avatar, AvatarFallback, AvatarImage } from '@surefy/ui/primitives/avatar'

import { getInitials } from '../Workspace.utils'

export interface UserAvatarProps {
  user: Pick<UserRefDto, 'name' | 'imageUrl'>
  size?: 'default' | 'sm' | 'lg'
}

/** The person's picture, or their initials; decorative, since the name is always shown beside it. */
export default function UserAvatar({ user, size = 'default' }: Readonly<UserAvatarProps>) {
  return (
    <Avatar size={size} aria-hidden="true">
      {user.imageUrl && <AvatarImage src={user.imageUrl} alt="" />}
      <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
    </Avatar>
  )
}
