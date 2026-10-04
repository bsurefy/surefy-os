// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import CodeBlock from './CodeBlock'
import { maskSecrets } from './maskSecrets'

// Fake keys are assembled at runtime so secret scanners do not flag the test source.
const fakeOpenAiKey = ['sk', 'proj1234567890abcdef'].join('-')
const fakeAwsKeyId = ['AKIA', 'ABCDEFGHIJKLMNOP'].join('')

describe('CodeBlock', () => {
  it('masks secrets in what is shown and copied', async () => {
    const user = userEvent.setup()
    render(
      <CodeBlock
        language="bash"
        labels={{ copy: 'Copy', copied: 'Copied' }}
        code={`export OPENAI_API_KEY=${fakeOpenAiKey}
curl https://api.example.com`}
      />,
    )
    expect(screen.getByText(/sk-proj••••••••/)).toBeInTheDocument()
    expect(screen.queryByText(/1234567890abcdef/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Copy' }))
    expect(await navigator.clipboard.readText()).toContain('sk-proj••••••••')
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('knows the common key shapes', () => {
    expect(maskSecrets('sk_live_abcd1234567890XYZ')).toBe('sk_live_abcd••••••••')
    expect(maskSecrets('Authorization: Bearer eyJhbGciOi.abc.def')).toBe(
      'Authorization: Bearer eyJh••••••••',
    )
    expect(maskSecrets(fakeAwsKeyId)).toBe('AKIAABCD••••••••')
    expect(maskSecrets('a plain sentence')).toBe('a plain sentence')
  })
})
