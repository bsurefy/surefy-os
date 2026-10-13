// SPDX-License-Identifier: AGPL-3.0-only
import { getTranslations } from 'next-intl/server'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('agents.editor')
  return { title: t('title') }
}

/** The editor itself is the layout; this page only names the route and its title. */
export default function AgentPage() {
  return null
}
