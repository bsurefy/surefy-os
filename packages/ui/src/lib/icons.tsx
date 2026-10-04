// SPDX-License-Identifier: AGPL-3.0-only
import { LucideProvider } from 'lucide-react'

import type { ReactNode } from 'react'

/**
 * Icon defaults for the whole app (docs/design/shared/foundations.md, Icons): lucide at stroke 1.75.
 * Size icons with `size-4` (16px) or `size-5` (20px). Mounted once by the app providers.
 */
export function IconProvider({ children }: Readonly<{ children: ReactNode }>) {
  return <LucideProvider strokeWidth={1.75}>{children}</LucideProvider>
}
