// SPDX-License-Identifier: AGPL-3.0-only
import { useId } from 'react'

import { IconTile, StatusPill } from '@surefy/ui/components/DataDisplay'
import type { StatusTone } from '@surefy/ui/components/DataDisplay'

import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/** One channel on the Publish tab: its name, what it is for, its state, and what is below. */
export default function ChannelCard({
  icon,
  name,
  help,
  status,
  children,
}: Readonly<{
  icon: LucideIcon
  name: string
  help: string
  status: { label: string; tone: StatusTone }
  children?: ReactNode
}>) {
  const nameId = useId()
  return (
    <div
      role="group"
      aria-labelledby={nameId}
      className="border-border flex flex-col gap-4 rounded-lg border px-3 py-3"
    >
      <div className="flex items-center gap-3">
        <IconTile icon={icon} size="sm" tone="primary" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span id={nameId} className="text-body text-foreground font-medium">
            {name}
          </span>
          <span className="text-caption text-muted-foreground">{help}</span>
        </div>
        <StatusPill tone={status.tone} label={status.label} />
      </div>
      {children}
    </div>
  )
}
