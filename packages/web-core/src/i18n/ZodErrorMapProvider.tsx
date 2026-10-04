// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'
import { useEffect } from 'react'
import { z } from 'zod'

import { createZodErrorMap } from './zodErrorMap'

import type { ReactNode } from 'react'

/**
 * Installs the global Zod error map (`z.config({ customError })`) from the active locale's
 * `validation` namespace. Mounted once by `CoreProviders`, below the intl provider. The map is set
 * in an effect, so it only exists in the browser: on the server nothing validates and a global
 * map would leak one request's locale into another.
 */
export function ZodErrorMapProvider({ children }: Readonly<{ children: ReactNode }>) {
  const t = useTranslations('validation')

  useEffect(() => {
    z.config({ customError: createZodErrorMap(t) })
    return () => {
      z.config({ customError: undefined })
    }
  }, [t])

  return children
}
