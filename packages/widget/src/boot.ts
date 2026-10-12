// SPDX-License-Identifier: MIT
import { SurefyWidget } from './widget.js'

// Mounting from the script tag `<script src="…/widget/v1/widget.js" data-token="wt_…" async>`:
// reads its own attributes, mounts one widget and exposes `window.SurefyWidget` with `open()`,
// `close()` and `toggle()` for the site's own buttons.

export interface SurefyWidgetGlobal {
  open: () => void
  close: () => void
  toggle: () => void
  destroy: () => void
}

declare global {
  interface Window {
    SurefyWidget?: SurefyWidgetGlobal
  }
}

/** The options a script tag carries; null when it has no token. */
export function optionsFromScript(script: HTMLScriptElement): {
  token: string
  apiUrl: string
  open: boolean
  locale: string | null
} | null {
  const token = filled(script.dataset.token)
  if (token === null) return null
  return {
    token,
    apiUrl: filled(script.dataset.apiUrl) ?? new URL(script.src, window.location.href).origin,
    open: script.dataset.open === 'true',
    locale: filled(script.dataset.locale),
  }
}

/** An attribute's trimmed value; null when it is missing or empty. */
function filled(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}

export function findScript(): HTMLScriptElement | null {
  if (document.currentScript instanceof HTMLScriptElement) return document.currentScript
  return document.querySelector<HTMLScriptElement>('script[data-token][src*="widget"]')
}

/** Mounts the widget once the page has a body; a second call returns the first widget's controls. */
export function boot(script: HTMLScriptElement | null = findScript()): SurefyWidgetGlobal | null {
  if (window.SurefyWidget) return window.SurefyWidget
  const options = script ? optionsFromScript(script) : null
  if (!options) {
    // eslint-disable-next-line no-console -- the site owner's only sign that the embed code is wrong
    console.warn('SurefyOS widget: add data-token="…" to the widget script tag.')
    return null
  }
  let widget: SurefyWidget | null = null
  const controls: SurefyWidgetGlobal = {
    open: () => widget?.open(),
    close: () => widget?.close(),
    toggle: () => widget?.toggle(),
    destroy: () => {
      widget?.destroy()
      widget = null
      delete window.SurefyWidget
    },
  }
  window.SurefyWidget = controls
  const mount = () => {
    widget = new SurefyWidget(options)
    widget.start()
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true })
  } else {
    mount()
  }
  return controls
}
