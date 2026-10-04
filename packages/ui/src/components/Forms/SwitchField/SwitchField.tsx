// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useId } from 'react'

import { cn } from '../../../lib/utils'
import { Label } from '../../../primitives/label'
import { Switch } from '../../../primitives/switch'

import type { SwitchFieldProps } from './SwitchField.types'

/** A setting row: label and description on the left, the switch on the right. */
export default function SwitchField({
  label,
  description,
  size = 'md',
  id,
  className,
  ...rest
}: Readonly<SwitchFieldProps>) {
  const generatedId = useId()
  const switchId = id ?? generatedId
  const descriptionId = description ? `${switchId}-description` : undefined
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={switchId} className="text-label text-foreground">
          {label}
        </Label>
        {description && (
          <p id={descriptionId} className="text-caption text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      <Switch id={switchId} size={size} aria-describedby={descriptionId} {...rest} />
    </div>
  )
}
