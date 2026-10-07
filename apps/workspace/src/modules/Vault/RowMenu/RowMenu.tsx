// SPDX-License-Identifier: AGPL-3.0-only
import { Ellipsis } from 'lucide-react'

import { Button } from '@surefy/ui/primitives/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@surefy/ui/primitives/dropdown-menu'

import type { ReactNode } from 'react'

/** The "⋯" menu at the end of a table row; `label` names it for screen readers ("Actions for OpenAI production"). */
export default function RowMenu({
  label,
  children,
}: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label}>
          <Ellipsis aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  )
}
