// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Field, SegmentedControl, SelectInput } from '@surefy/ui/components/Forms'
import { Section } from '@surefy/ui/components/Layout'

import { useProfilePreferencesController } from './ProfilePreferences.controller'

/** Theme and language; both apply at once and are saved to the profile. */
export default function ProfilePreferences() {
  const {
    theme,
    themeOptions,
    onThemeChange,
    locale,
    localeOptions,
    onLocaleChange,
    isSavingLocale,
    t,
  } = useProfilePreferencesController()

  return (
    <Section title={t('title')}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-label">{t('theme')}</span>
          <SegmentedControl
            label={t('theme')}
            options={themeOptions}
            value={theme}
            onValueChange={onThemeChange}
            className="self-start"
          />
        </div>
        <Field label={t('language')} description={t('languageHelp')}>
          <SelectInput
            options={localeOptions}
            value={locale}
            onValueChange={onLocaleChange}
            isDisabled={isSavingLocale}
            className="max-w-xs"
          />
        </Field>
      </div>
    </Section>
  )
}
