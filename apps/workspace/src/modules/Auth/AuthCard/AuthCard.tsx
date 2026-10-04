// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react'

/**
 * The content of every sign-in screen: a heading, one sentence, the body and the links below it.
 * The 400px card, brand and footer come from the `(auth)` layout.
 */
export default function AuthCard({
  title,
  description,
  footer,
  children,
}: Readonly<{ title: string; description?: ReactNode; footer?: ReactNode; children?: ReactNode }>) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-page-title">{title}</h1>
        {description && <p className="text-body text-muted-foreground">{description}</p>}
      </div>
      {children}
      {footer && (
        <div className="text-body text-muted-foreground flex flex-col gap-2">{footer}</div>
      )}
    </div>
  )
}
