// SPDX-License-Identifier: AGPL-3.0-only
import { stackVariants } from './Stack.variants'
import { cn } from '../../../lib/utils'

import type { StackProps } from './Stack.types'

export default function Stack({ direction, gap, className, ...rest }: Readonly<StackProps>) {
  return <div className={cn(stackVariants({ direction, gap }), className)} {...rest} />
}
