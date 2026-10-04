// SPDX-License-Identifier: AGPL-3.0-only
import { getTranslations } from 'next-intl/server'

import { SetupWizard } from '@/modules/Setup'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('setup.wizard')
  return { title: t('title') }
}

export default function SetupPage() {
  return <SetupWizard />
}
