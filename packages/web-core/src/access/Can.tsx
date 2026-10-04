// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import type { Permission } from '@surefy/contracts'

import { useCan } from './useCan'

import type { ReactNode } from 'react'

export interface CanProps {
  permission: Permission
  /** Rendered instead, for example a disabled control with a tooltip. Default: nothing. */
  fallback?: ReactNode
  children: ReactNode
}

/** Renders `children` only when the person holds `permission`. Cosmetic: the API decides. */
export function Can({ permission, fallback = null, children }: Readonly<CanProps>) {
  return useCan(permission) ? children : fallback
}
