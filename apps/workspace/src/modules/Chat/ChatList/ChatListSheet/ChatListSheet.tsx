// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { MessagesSquare } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@surefy/ui/primitives/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@surefy/ui/primitives/sheet'

import ChatListPanel from '../ChatListPanel'

/** Below the `lg` breakpoint the chat list is a slide-over panel opened from the page (responsive.md). */
export default function ChatListSheet() {
  const t = useTranslations('chat.list')
  const pathname = usePathname()
  // Open for the page it was opened on: opening a chat or starting a new one navigates, which
  // closes the panel without an effect
  const [openOnPath, setOpenOnPath] = useState<string | null>(null)

  return (
    <Sheet
      open={openOnPath === pathname}
      onOpenChange={(open) => {
        setOpenOnPath(open ? pathname : null)
      }}
    >
      <SheetTrigger asChild>
        <Button variant="secondary" size="sm" className="self-start lg:hidden">
          <MessagesSquare aria-hidden />
          {t('open')}
        </Button>
      </SheetTrigger>
      <SheetContent side="left" size="sm" className="flex flex-col gap-3">
        <SheetHeader>
          <SheetTitle>{t('label')}</SheetTitle>
          <SheetDescription className="sr-only">{t('sheetDescription')}</SheetDescription>
        </SheetHeader>
        <ChatListPanel />
      </SheetContent>
    </Sheet>
  )
}
