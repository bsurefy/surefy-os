// SPDX-License-Identifier: AGPL-3.0-only
import { cn } from '../../../lib/utils'

import type { PageHeaderProps } from './PageHeader.types'

/** Title row of a page: one h1, description, actions top right, optional tabs underneath. */
export default function PageHeader({
  title,
  description,
  level = 'page',
  breadcrumb,
  icon,
  status,
  facts,
  actions,
  tabs,
  className,
  ...rest
}: Readonly<PageHeaderProps>) {
  return (
    <header className={cn('flex flex-col gap-4', className)} {...rest}>
      {breadcrumb}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-6">
        <div className="flex min-w-0 items-start gap-3.5">
          {icon}
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <h1
                className={cn(
                  'text-foreground min-w-0 truncate',
                  level === 'page' ? 'text-page-title' : 'text-object-title',
                )}
              >
                {title}
              </h1>
              {status}
            </div>
            {description && <p className="text-body text-foreground-secondary">{description}</p>}
            {facts && (
              <div className="text-caption text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1">
                {facts}
              </div>
            )}
          </div>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {tabs}
    </header>
  )
}
