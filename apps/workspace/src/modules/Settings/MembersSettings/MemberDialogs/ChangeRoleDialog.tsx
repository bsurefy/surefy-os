// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import { Banner } from '@surefy/ui/components/Feedback'
import { Button } from '@surefy/ui/primitives/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@surefy/ui/primitives/dialog'
import { Label } from '@surefy/ui/primitives/label'
import { RadioGroup, RadioGroupItem } from '@surefy/ui/primitives/radio-group'

import { ASSIGNABLE_ROLES } from '../MembersSettings.constants'
import { useChangeRoleController } from './ChangeRoleDialog.controller'

import type { ChangeRoleDialogProps } from './MemberDialogs.types'

/**
 * Change one person's role, or the selected people's. Promotion to Admin or Owner and demotion are
 * T2: the dialog says what changes before the person confirms.
 */
export default function ChangeRoleDialog(props: Readonly<ChangeRoleDialogProps>) {
  const c = useChangeRoleController(props)
  const t = useTranslations('settings.members.changeRole')

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{c.title}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          {c.errorMessage && <Banner tone="destructive" title={c.errorMessage} isAnnounced />}
          <RadioGroup value={c.role} onValueChange={c.onRoleChange} aria-label={t('roleLabel')}>
            {ASSIGNABLE_ROLES.map((role) => (
              <div key={role} className="flex items-start gap-2">
                <RadioGroupItem
                  id={`change-role-${role}`}
                  value={role}
                  disabled={role === 'owner' && !props.canManageAdmins}
                />
                <Label htmlFor={`change-role-${role}`} className="flex flex-col gap-0.5">
                  <span className="font-medium">{t(`roles.${role}.name`)}</span>
                  <span className="text-caption text-muted-foreground font-normal">
                    {t(`roles.${role}.description`)}
                  </span>
                </Label>
              </div>
            ))}
          </RadioGroup>
          {c.impact && <Banner tone="warning" title={c.impact} />}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={props.onClose}>
            {t('cancel')}
          </Button>
          <Button
            isLoading={c.isPending}
            aria-disabled={!c.isChanged}
            variant={c.isDemotion ? 'destructive' : 'primary'}
            onClick={c.onConfirm}
          >
            {t('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
