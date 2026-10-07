// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import { cn } from '@surefy/ui/lib/utils'

import { PASSWORD_STRENGTH_LEVELS } from '../Auth.constants'
import { getPasswordStrength } from '../Auth.utils'

/** The bar's color for a level: red up to weak, amber for fair, green above. */
function getFillClass(level: number): string {
  if (level <= 1) return 'bg-destructive'
  return level === 2 ? 'bg-warning' : 'bg-success'
}

const LEVEL_KEYS = ['empty', 'weak', 'fair', 'good', 'strong'] as const

/** The strength meter under a new password: four segments and the word for the level. */
export default function PasswordStrength({ password }: Readonly<{ password: string }>) {
  const t = useTranslations('auth.passwordStrength')
  const level = getPasswordStrength(password)
  const levelKey = LEVEL_KEYS.at(level) ?? 'empty'

  return (
    <div className="flex flex-col gap-1.5" data-slot="password-strength">
      <div
        role="meter"
        aria-label={t('label')}
        aria-valuemin={0}
        aria-valuemax={PASSWORD_STRENGTH_LEVELS}
        aria-valuenow={level}
        aria-valuetext={t(levelKey)}
        className="flex gap-1"
      >
        {Array.from({ length: PASSWORD_STRENGTH_LEVELS }, (_, index) => (
          <span
            key={index}
            className={cn(
              'h-1.5 flex-1 rounded-full',
              index < level ? getFillClass(level) : 'bg-muted',
            )}
          />
        ))}
      </div>
      <p className="text-caption text-muted-foreground">{level === 0 ? t('hint') : t(levelKey)}</p>
    </div>
  )
}
