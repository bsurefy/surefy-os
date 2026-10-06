// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import { FEATURES } from '@surefy/contracts'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@surefy/ui/primitives/dialog'
import { UpgradeCard } from '@surefy/web-core/access'

/**
 * What "Create organization" opens on a Community install, which holds one organization. It lives
 * outside the user menu so it stays open after the menu closes.
 */
export default function OrgUpgradeDialog({
  isOpen,
  onOpenChange,
}: Readonly<{ isOpen: boolean; onOpenChange: (isOpen: boolean) => void }>) {
  const t = useTranslations('workspace.org')

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('create')}</DialogTitle>
          <DialogDescription>{t('upgradeHint')}</DialogDescription>
        </DialogHeader>
        <UpgradeCard feature={FEATURES.MULTI_ORGANIZATION} headingLevel={3} />
      </DialogContent>
    </Dialog>
  )
}
