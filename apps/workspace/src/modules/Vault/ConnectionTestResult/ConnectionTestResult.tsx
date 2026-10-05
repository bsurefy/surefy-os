// SPDX-License-Identifier: AGPL-3.0-only
import { useTranslations } from 'next-intl'

import type { ConnectionTestDto } from '@surefy/contracts'
import { Banner } from '@surefy/ui/components/Feedback'

const MODEL_NAMES_SHOWN = 5

/**
 * What a connection test found: the models available and the latency, or the provider's reason
 * with the fix, and a warning when the same key is already stored.
 */
export default function ConnectionTestResult({ result }: Readonly<{ result: ConnectionTestDto }>) {
  const t = useTranslations('vault.test')
  const tErrors = useTranslations('errors')

  if (!result.ok) {
    const code = result.reasonCode ?? 'VAULT_KEY_INVALID'
    return (
      <Banner
        tone="destructive"
        title={t('failed')}
        description={
          <span className="flex flex-col gap-1">
            <span>{tErrors(code)}</span>
            {result.checkedUrl && <span>{t('checkedUrl', { url: result.checkedUrl })}</span>}
            {code === 'LOCAL_SERVER_UNREACHABLE' && <span>{t('networkHint')}</span>}
          </span>
        }
        isAnnounced
      />
    )
  }

  const names = result.models.slice(0, MODEL_NAMES_SHOWN).map((model) => model.displayName)
  const more = result.models.length - names.length
  return (
    <div className="flex flex-col gap-2">
      <Banner
        tone="success"
        title={
          result.latencyMs === null
            ? t('passedNoLatency')
            : t('passed', { latency: result.latencyMs })
        }
        description={
          result.models.length === 0
            ? t('noModels')
            : t('models', {
                count: result.models.length,
                names: names.join(', ') + (more > 0 ? ` +${more}` : ''),
              })
        }
        isAnnounced
      />
      {result.duplicateOf && (
        <Banner
          tone="warning"
          title={t('duplicate', { name: result.duplicateOf.name })}
          description={t('duplicateHelp')}
        />
      )}
    </div>
  )
}
