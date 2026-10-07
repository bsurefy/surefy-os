// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Banner, SessionBanner } from '@surefy/ui/components/Feedback'
import { Button } from '@surefy/ui/primitives/button'

import { useShellBannersController } from './ShellBanners.controller'

/** Banners above the whole frame; they push it down instead of covering it. */
export default function ShellBanners() {
  const { accessMessage, isOffline, onRetry, t } = useShellBannersController()
  if (!accessMessage && !isOffline) return null

  return (
    <div className="flex flex-col">
      {accessMessage && <SessionBanner kind="access" message={accessMessage} />}
      {isOffline && (
        <Banner
          tone="warning"
          title={t('offline.title')}
          description={t('offline.description')}
          action={
            <Button variant="secondary" size="sm" onClick={onRetry}>
              {t('offline.retry')}
            </Button>
          }
          isAnnounced
          className="rounded-none"
        />
      )}
    </div>
  )
}
