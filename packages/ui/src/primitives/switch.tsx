// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Switch as SwitchPrimitive } from 'radix-ui'
import * as React from 'react'

import { cn } from '@surefy/ui/lib/utils'

/**
 * Catalog sizes: `md` 40×24 (settings), `sm` 36×22 with a 24px-high hit area (tables, dense lists).
 * On: `primary` track, `primary-foreground` knob. Off: `input` track, `surface` knob in light and
 * `foreground` knob in dark.
 */
function Switch({
  className,
  size = 'md',
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: 'sm' | 'md'
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        'peer group/switch data-[state=checked]:bg-primary data-[state=unchecked]:bg-input relative inline-flex shrink-0 items-center rounded-full border-2 border-transparent transition-colors after:absolute after:inset-x-0 after:-inset-y-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[size=md]:h-6 data-[size=md]:w-10 data-[size=sm]:h-[1.375rem] data-[size=sm]:w-9',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          'data-[state=checked]:bg-primary-foreground data-[state=unchecked]:bg-surface dark:data-[state=unchecked]:bg-foreground pointer-events-none block rounded-full shadow-sm ring-0 transition-transform group-data-[size=md]/switch:size-5 group-data-[size=sm]/switch:size-[1.125rem] group-data-[size=md]/switch:data-[state=checked]:translate-x-4 group-data-[size=sm]/switch:data-[state=checked]:translate-x-3.5 data-[state=unchecked]:translate-x-0',
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
