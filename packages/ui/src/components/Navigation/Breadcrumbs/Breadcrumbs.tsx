// SPDX-License-Identifier: AGPL-3.0-only
import { Fragment } from 'react'

import { cn } from '../../../lib/utils'
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem as Crumb,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '../../../primitives/breadcrumb'

import type { BreadcrumbsProps } from './Breadcrumbs.types'

const MAX_LEVELS = 3

/** At most three levels; longer trails keep the first and the last two and truncate the middle. */
export default function Breadcrumbs({
  items,
  label,
  linkComponent: Link = 'a',
  className,
}: Readonly<BreadcrumbsProps>) {
  const isTruncated = items.length > MAX_LEVELS
  const visible = isTruncated ? [items[0], ...items.slice(-2)] : items
  return (
    <Breadcrumb aria-label={label} className={cn('min-w-0', className)}>
      {/* One line in the 56px top bar: long labels truncate instead of wrapping. */}
      <BreadcrumbList className="min-w-0 flex-nowrap">
        {visible.map((item, index) => {
          if (!item) return null
          const isLast = index === visible.length - 1
          return (
            <Fragment key={`${item.label}-${String(index)}`}>
              {index > 0 && <BreadcrumbSeparator />}
              {isTruncated && index === 1 && (
                <>
                  <Crumb>
                    <BreadcrumbEllipsis />
                  </Crumb>
                  <BreadcrumbSeparator />
                </>
              )}
              <Crumb className="min-w-0">
                {isLast || !item.href ? (
                  // The current object is plain text, not a disabled link (design rule).
                  <BreadcrumbPage role={undefined} aria-disabled={undefined} className="truncate">
                    {item.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={item.href} className="truncate">
                      {item.label}
                    </Link>
                  </BreadcrumbLink>
                )}
              </Crumb>
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
