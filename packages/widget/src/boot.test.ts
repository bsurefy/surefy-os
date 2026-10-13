// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it, vi } from 'vitest'

import { boot, optionsFromScript } from './boot.js'
import { CONFIG, json, silence, TOKEN } from './test/fakeServer.js'

const scriptTag = (attributes: Record<string, string>) => {
  const script = document.createElement('script')
  script.src = 'https://api.example.com/widget/v1/widget.js'
  for (const [name, value] of Object.entries(attributes)) script.setAttribute(name, value)
  return script
}

afterEach(() => {
  window.SurefyWidget?.destroy()
  vi.restoreAllMocks()
})

describe('boot', () => {
  it('reads the token, the API address from the script source, and the options', () => {
    expect(optionsFromScript(scriptTag({ 'data-token': TOKEN }))).toEqual({
      token: TOKEN,
      apiUrl: 'https://api.example.com',
      open: false,
      locale: null,
    })
    expect(
      optionsFromScript(
        scriptTag({
          'data-token': ` ${TOKEN} `,
          'data-api-url': 'https://chat.acme.com',
          'data-open': 'true',
          'data-locale': 'de',
        }),
      ),
    ).toEqual({ token: TOKEN, apiUrl: 'https://chat.acme.com', open: true, locale: 'de' })
    expect(optionsFromScript(scriptTag({ 'data-token': '  ' }))).toBeNull()
  })

  it('mounts once and exposes open, close and toggle for the site', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(200, { data: CONFIG }))
    const controls = boot(scriptTag({ 'data-token': TOKEN }))
    expect(controls).toBe(window.SurefyWidget)
    expect(boot(scriptTag({ 'data-token': TOKEN }))).toBe(controls)
    expect(document.querySelectorAll('[data-surefy-widget]')).toHaveLength(1)
    controls?.open()
    const panel = document
      .querySelector('[data-surefy-widget]')
      ?.shadowRoot?.querySelector<HTMLElement>('.panel')
    expect(panel?.hidden).toBe(false)
    controls?.toggle()
    expect(panel?.hidden).toBe(true)
    controls?.destroy()
    expect(window.SurefyWidget).toBeUndefined()
    expect(document.querySelector('[data-surefy-widget]')).toBeNull()
  })

  it('warns the site owner when the token is missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(silence)
    expect(boot(scriptTag({}))).toBeNull()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('data-token'))
  })
})
