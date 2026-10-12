// SPDX-License-Identifier: MIT
import { NETWORK_ERROR, STREAM_INTERRUPTED, WidgetApi, WidgetApiError } from './api.js'
import {
  loadConversation,
  messagesToSend,
  newConversation,
  saveConversation,
  storageKeyOf,
  type AnswerEntry,
  type ConversationState,
  type Entry,
} from './conversation.js'
import { labelsFor, type Labels } from './labels.js'
import { STYLES } from './styles.js'
import { appendRichText, linkTo } from './text.js'

import type { WidgetConfigDto, WidgetStreamEvent } from './protocol.js'

// Website widget (design/workspace/website-widget.md): a launcher and a chat panel drawn in a
// Shadow DOM, talking to the public widget endpoint with the channel token.

export interface WidgetOptions {
  token: string
  apiUrl: string
  /** Start with the panel open (`data-open`). */
  open?: boolean
  /** Overrides the organization's language (`data-locale`). */
  locale?: string | null
  /** Where the widget is mounted; `document.body` by default. */
  container?: HTMLElement
  storage?: Storage | null
  fetch?: typeof fetch
}

/** Codes after which the agent cannot answer at all on this page. */
const UNAVAILABLE_CODES = new Set(['AGENT_PAUSED', 'AGENT_NOT_PUBLISHED', 'AGENT_NOT_FOUND'])
/** Codes that mean the embed code is wrong for this page: the widget hides and tells the site owner. */
const SETUP_CODES = new Set(['AGENT_WIDGET_TOKEN_INVALID', 'AGENT_WIDGET_ORIGIN_NOT_ALLOWED'])
const RATE_LIMITED = 'RATE_LIMITED'
const DEFAULT_RETRY_AFTER_SECONDS = 30
/** A run that waits for a person: how soon the widget reattaches after the server ends the stream. */
const REATTACH_DELAY_MS = 1500

const ICONS = {
  chat: 'M4 5h16v11H8l-4 4z',
  close: 'M6 6l12 12M18 6L6 18',
  newChat: 'M12 5v14M5 12h14',
  send: 'M5 12h13M12 5l7 7-7 7',
}

function icon(name: keyof typeof ICONS): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', ICONS[name])
  svg.append(path)
  return svg
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

type Notice =
  { kind: 'rate-limited'; until: number } | { kind: 'offline' } | { kind: 'unavailable' } | null

export class SurefyWidget {
  private readonly api: WidgetApi
  private readonly storage: Storage | null
  private readonly storageKey: string
  private readonly host: HTMLElement
  private readonly root: HTMLDivElement
  private readonly launcher: HTMLButtonElement
  private readonly panel: HTMLDivElement
  private readonly title: HTMLHeadingElement
  private readonly messages: HTMLDivElement
  private readonly composer: HTMLFormElement
  private readonly input: HTMLTextAreaElement
  private readonly sendButton: HTMLButtonElement
  private readonly live: HTMLDivElement

  private labels: Labels
  private config: WidgetConfigDto | null = null
  private conversation: ConversationState
  private isOpen = false
  private isLoading = true
  private notice: Notice = null
  private stream: AbortController | null = null
  private timers = new Set<ReturnType<typeof setTimeout>>()
  private readonly onOnline = () => {
    this.resumeAfterOffline()
  }

  constructor(private readonly options: WidgetOptions) {
    this.api = new WidgetApi(options.apiUrl, options.token, options.fetch)
    this.storage = options.storage === undefined ? safeSessionStorage() : options.storage
    this.storageKey = storageKeyOf(options.token)
    this.conversation = loadConversation(this.storage, this.storageKey)
    this.labels = labelsFor(options.locale)

    this.host = element('div')
    this.host.setAttribute('data-surefy-widget', '')
    this.host.dataset.theme = 'auto'
    const shadow = this.host.attachShadow({ mode: 'open' })
    const style = element('style')
    style.textContent = STYLES
    this.root = element('div', 'root')
    this.root.dataset.position = 'bottom_right'
    this.root.dataset.open = 'false'

    this.panel = element('div', 'panel')
    this.panel.id = 'surefy-widget-panel'
    this.panel.setAttribute('role', 'dialog')
    this.panel.setAttribute('aria-modal', 'false')
    this.panel.hidden = true
    this.title = element('h2', 'title')
    this.title.id = 'surefy-widget-title'
    this.panel.setAttribute('aria-labelledby', this.title.id)
    const header = element('div', 'header')
    header.append(
      this.title,
      this.iconButton('newChat', () => {
        this.newChat()
      }),
      this.iconButton('close', () => {
        this.close()
      }),
    )
    this.messages = element('div', 'messages')
    this.composer = element('form', 'composer')
    this.input = element('textarea')
    this.input.rows = 1
    this.sendButton = element('button', 'send')
    this.sendButton.type = 'submit'
    this.sendButton.append(icon('send'))
    this.composer.append(this.input, this.sendButton)
    this.live = element('div', 'visually-hidden')
    this.live.setAttribute('aria-live', 'polite')
    const disclaimer = element('p', 'disclaimer')
    disclaimer.dataset.role = 'disclaimer'
    this.panel.append(header, this.messages, this.composer, disclaimer, this.live)

    this.launcher = element('button', 'launcher')
    this.launcher.type = 'button'
    this.launcher.setAttribute('aria-controls', this.panel.id)
    this.launcher.setAttribute('aria-expanded', 'false')
    this.launcher.addEventListener('click', () => {
      this.toggle()
    })

    this.root.append(this.panel, this.launcher)
    shadow.append(style, this.root)
    this.bindComposer()
    this.panel.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.close()
    })
    window.addEventListener('online', this.onOnline)
    ;(options.container ?? document.body).append(this.host)

    this.applyLabels()
    this.render()
  }

  /** Loads the settings and, with `open`, opens the panel. Called once after mounting. */
  start(): void {
    void this.loadConfig()
    if (this.options.open) this.open()
  }

  // ── Public controls (window.SurefyWidget) ─────────────────────────────────────────────────────

  open(): void {
    if (this.isOpen || !this.host.isConnected) return
    this.isOpen = true
    this.panel.hidden = false
    this.root.dataset.open = 'true'
    this.launcher.setAttribute('aria-expanded', 'true')
    this.launcher.replaceChildren(icon('close'))
    this.launcher.setAttribute('aria-label', this.labels.close)
    this.render()
    this.input.focus()
  }

  close(): void {
    if (!this.isOpen) return
    this.isOpen = false
    this.panel.hidden = true
    this.root.dataset.open = 'false'
    this.launcher.setAttribute('aria-expanded', 'false')
    this.applyLabels()
    this.launcher.focus()
  }

  toggle(): void {
    if (this.isOpen) this.close()
    else this.open()
  }

  /** Removes the widget from the page; the conversation stays in the tab's storage. */
  destroy(): void {
    this.stream?.abort()
    for (const timer of this.timers) clearTimeout(timer)
    window.removeEventListener('online', this.onOnline)
    this.host.remove()
  }

  // ── Loading ───────────────────────────────────────────────────────────────────────────────────

  private async loadConfig(): Promise<void> {
    try {
      this.config = await this.api.getConfig()
    } catch (error) {
      this.isLoading = false
      this.handleRequestError(error)
      return
    }
    this.isLoading = false
    this.labels = labelsFor(this.options.locale ?? this.config.locale)
    this.host.dataset.theme = this.config.theme
    this.root.dataset.position = this.config.position
    this.input.maxLength = this.config.messageMaxLength
    this.applyLabels()
    this.render()
    this.resumeOpenAnswers()
  }

  /** Answers left open by a page load: reattach to their run, or offer Retry. */
  private resumeOpenAnswers(): void {
    const last = this.conversation.entries.at(-1)
    if (last?.role !== 'assistant') return
    if (last.state !== 'streaming' && last.state !== 'waiting') return
    if (last.runId === null) {
      this.fail(last, STREAM_INTERRUPTED)
      return
    }
    void this.runStream(last, 'reattach')
  }

  // ── Sending ───────────────────────────────────────────────────────────────────────────────────

  private bindComposer(): void {
    this.composer.addEventListener('submit', (event) => {
      event.preventDefault()
      this.submit()
    })
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault()
        this.submit()
      }
    })
    this.input.addEventListener('input', () => {
      this.input.style.height = 'auto'
      this.input.style.height = `${String(Math.min(this.input.scrollHeight, 120))}px`
      this.updateSendState()
    })
  }

  private submit(): void {
    const text = this.input.value.trim()
    if (text === '' || !this.canSend()) return
    this.input.value = ''
    this.input.style.height = ''
    this.sendText(text)
  }

  /** Sends a visitor message (typed or a starter) and streams the answer. */
  sendText(text: string): void {
    if (!this.canSend()) return
    const entries = this.conversation.entries
    entries.push({ id: crypto.randomUUID(), role: 'user', text })
    const answer = this.newAnswer()
    entries.push(answer)
    this.persist()
    this.render()
    if (!navigator.onLine) {
      this.notice = { kind: 'offline' }
      this.render()
      return
    }
    void this.runStream(answer, 'send')
  }

  private retry(answer: AnswerEntry): void {
    if (this.isBusy() || this.conversation.entries.at(-1) !== answer) return
    if (this.notice?.kind === 'rate-limited') return
    Object.assign(answer, this.newAnswer(), { id: answer.id })
    this.persist()
    this.render()
    void this.runStream(answer, 'send')
  }

  private newChat(): void {
    this.stream?.abort()
    this.stream = null
    this.conversation = newConversation()
    if (this.notice?.kind !== 'unavailable') this.notice = null
    this.persist()
    this.render()
    this.input.focus()
  }

  private async runStream(answer: AnswerEntry, mode: 'send' | 'reattach'): Promise<void> {
    const controller = new AbortController()
    this.stream = controller
    const onEvent = (event: WidgetStreamEvent) => {
      if (this.stream !== controller) return
      this.applyEvent(answer, event)
    }
    try {
      if (mode === 'reattach' && answer.runId !== null) {
        await this.api.reattach(
          answer.runId,
          this.conversation.conversationId,
          answer.lastEventId,
          onEvent,
          controller.signal,
        )
      } else {
        await this.api.send(
          {
            conversationId: this.conversation.conversationId,
            messages: messagesToSend(this.conversation.entries),
          },
          onEvent,
          controller.signal,
        )
      }
    } catch (error) {
      if (this.stream !== controller) return
      if (error instanceof DOMException && error.name === 'AbortError') return
      this.stream = null
      this.handleAnswerError(answer, error)
      return
    }
    if (this.stream !== controller) return
    this.stream = null
    if (answer.state === 'streaming') this.fail(answer, STREAM_INTERRUPTED)
    else if (answer.state === 'waiting') this.later(() => void this.runStream(answer, 'reattach'))
  }

  private applyEvent(answer: AnswerEntry, event: WidgetStreamEvent): void {
    if (event.id !== null) answer.lastEventId = event.id
    switch (event.event) {
      case 'run':
        answer.runId = event.data.runId
        break
      case 'text-delta':
        answer.state = 'streaming'
        answer.text += event.data.delta
        break
      case 'source':
        if (!answer.sources.some((source) => source.index === event.data.index))
          answer.sources.push(event.data)
        break
      case 'waiting-approval':
        answer.state = 'waiting'
        break
      case 'done':
        if (event.data.status === 'succeeded') {
          answer.state = 'done'
          this.announce(answer)
        } else {
          answer.state = 'failed'
          answer.errorCode = event.data.errorCode
        }
        break
      case 'error':
        answer.state = 'failed'
        answer.errorCode = event.data.code
        break
    }
    this.persist()
    this.render()
  }

  // ── Errors ────────────────────────────────────────────────────────────────────────────────────

  private handleAnswerError(answer: AnswerEntry, error: unknown): void {
    const code = error instanceof WidgetApiError ? error.code : STREAM_INTERRUPTED
    if (code === NETWORK_ERROR && !navigator.onLine) {
      answer.state = 'streaming'
      this.notice = { kind: 'offline' }
      this.persist()
      this.render()
      return
    }
    if (UNAVAILABLE_CODES.has(code) || SETUP_CODES.has(code)) {
      this.removeEntry(answer)
      this.handleRequestError(error)
      return
    }
    if (code === RATE_LIMITED) {
      const seconds =
        (error instanceof WidgetApiError ? error.retryAfterSeconds : null) ??
        DEFAULT_RETRY_AFTER_SECONDS
      this.notice = { kind: 'rate-limited', until: Date.now() + seconds * 1000 }
      this.later(() => {
        if (this.notice?.kind === 'rate-limited') this.notice = null
        this.render()
      }, seconds * 1000)
      this.tickCountdown()
    }
    this.fail(answer, code)
  }

  /** A failure outside an answer (loading the settings, or a code that ends the chat). */
  private handleRequestError(error: unknown): void {
    const code = error instanceof WidgetApiError ? error.code : STREAM_INTERRUPTED
    if (SETUP_CODES.has(code)) {
      // eslint-disable-next-line no-console -- the site owner's only sign that the embed code is wrong
      console.warn(
        code === 'AGENT_WIDGET_ORIGIN_NOT_ALLOWED'
          ? `SurefyOS widget: ${window.location.origin} is not an allowed origin for this widget. Add it on the agent's Publish tab.`
          : "SurefyOS widget: the widget token is not valid. Copy the embed code again from the agent's Publish tab.",
      )
      this.destroy()
      return
    }
    if (UNAVAILABLE_CODES.has(code)) this.notice = { kind: 'unavailable' }
    this.render()
  }

  private fail(answer: AnswerEntry, code: string): void {
    answer.state = 'failed'
    answer.errorCode = code
    this.persist()
    this.render()
  }

  private resumeAfterOffline(): void {
    if (this.notice?.kind !== 'offline') return
    this.notice = null
    const last = this.conversation.entries.at(-1)
    if (last?.role === 'assistant' && last.state === 'streaming' && !this.isBusy())
      void this.runStream(last, last.runId === null ? 'send' : 'reattach')
    this.render()
  }

  // ── Rendering ─────────────────────────────────────────────────────────────────────────────────

  private applyLabels(): void {
    const name = this.config?.agentName ?? ''
    this.title.textContent = name
    if (!this.isOpen) {
      this.launcher.replaceChildren(icon('chat'))
      this.launcher.setAttribute('aria-label', this.labels.open(name).trim())
    }
    this.input.placeholder = this.labels.placeholder
    this.input.setAttribute('aria-label', this.labels.placeholder)
    this.sendButton.setAttribute('aria-label', this.labels.send)
    const [newChatButton, closeButton] =
      this.panel.querySelectorAll<HTMLButtonElement>('.header .icon-button')
    newChatButton?.setAttribute('aria-label', this.labels.newChat)
    closeButton?.setAttribute('aria-label', this.labels.close)
    const disclaimer = this.panel.querySelector('[data-role="disclaimer"]')
    if (disclaimer) disclaimer.textContent = this.labels.disclaimer
  }

  private render(): void {
    this.updateSendState()
    this.composer.hidden = this.notice?.kind === 'unavailable'
    if (!this.isOpen) return
    const nodes: Node[] = []
    if (this.isLoading) {
      nodes.push(element('div', 'status', this.labels.loading))
    } else if (this.notice?.kind === 'unavailable') {
      nodes.push(element('div', 'status', this.labels.unavailable))
    } else {
      if (this.conversation.entries.length === 0) nodes.push(...this.renderEmpty())
      for (const entry of this.conversation.entries) nodes.push(this.renderEntry(entry))
      const notice = this.renderNotice()
      if (notice) nodes.push(notice)
    }
    const atBottom =
      this.messages.scrollHeight - this.messages.scrollTop - this.messages.clientHeight < 40
    this.messages.replaceChildren(...nodes)
    if (atBottom) this.messages.scrollTop = this.messages.scrollHeight
  }

  private renderEmpty(): Node[] {
    const configured = this.config?.greeting.trim() ?? ''
    const greeting = element(
      'p',
      'greeting',
      configured === '' ? this.labels.defaultGreeting : configured,
    )
    const starters = element('div', 'starters')
    for (const starter of this.config?.conversationStarters ?? []) {
      const chip = element('button', 'starter', starter)
      chip.type = 'button'
      chip.addEventListener('click', () => {
        this.sendText(starter)
      })
      starters.append(chip)
    }
    return starters.childElementCount > 0 ? [greeting, starters] : [greeting]
  }

  private renderEntry(entry: Entry): Node {
    if (entry.role === 'user') return element('div', 'bubble visitor', entry.text)
    const bubble = element('div', 'bubble answer')
    if (entry.text === '' && (entry.state === 'streaming' || entry.state === 'waiting')) {
      const dots = element('span', 'dots')
      dots.setAttribute('role', 'img')
      dots.setAttribute('aria-label', this.labels.thinking)
      dots.append(element('span'), element('span'), element('span'))
      bubble.append(dots)
    } else {
      appendRichText(bubble, entry.text)
    }
    if (entry.sources.length > 0) bubble.append(this.renderSources(entry))
    const wrapper = document.createDocumentFragment()
    wrapper.append(bubble)
    if (entry.state === 'waiting')
      wrapper.append(element('div', 'note warning', this.labels.waiting))
    if (entry.state === 'failed') {
      const note = element('div', 'note danger', this.labels.failed)
      const isLast = this.conversation.entries.at(-1) === entry
      if (isLast && entry.errorCode !== RATE_LIMITED) {
        const retry = element('button', 'retry', this.labels.retry)
        retry.type = 'button'
        retry.addEventListener('click', () => {
          this.retry(entry)
        })
        note.append(retry)
      }
      wrapper.append(note)
    }
    return wrapper
  }

  private renderSources(entry: AnswerEntry): HTMLElement {
    const list = element('ol', 'sources')
    list.setAttribute('aria-label', this.labels.sources)
    for (const source of [...entry.sources].sort((a, b) => a.index - b.index)) {
      const item = element('li')
      const label = `${String(source.index)}. ${source.title}${
        source.page === null ? '' : ` (${this.labels.page(source.page)})`
      }`
      item.append(source.url === null ? label : linkTo(source.url, label))
      list.append(item)
    }
    return list
  }

  private renderNotice(): HTMLElement | null {
    if (this.notice?.kind === 'offline') return element('div', 'note warning', this.labels.offline)
    if (this.notice?.kind === 'rate-limited') {
      const seconds = Math.max(1, Math.ceil((this.notice.until - Date.now()) / 1000))
      return element('div', 'note warning', this.labels.rateLimited(seconds))
    }
    return null
  }

  private updateSendState(): void {
    this.sendButton.disabled = !this.canSend() || this.input.value.trim() === ''
  }

  private announce(answer: AnswerEntry): void {
    this.live.textContent = `${this.labels.answerReady}: ${answer.text.slice(0, 300)}`
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────────────────────

  private canSend(): boolean {
    return (
      this.config !== null &&
      !this.isBusy() &&
      this.notice?.kind !== 'unavailable' &&
      this.notice?.kind !== 'rate-limited' &&
      this.notice?.kind !== 'offline'
    )
  }

  private isBusy(): boolean {
    const last = this.conversation.entries.at(-1)
    return (
      this.stream !== null ||
      (last?.role === 'assistant' && (last.state === 'streaming' || last.state === 'waiting'))
    )
  }

  private newAnswer(): AnswerEntry {
    return {
      id: crypto.randomUUID(),
      role: 'assistant',
      text: '',
      sources: [],
      state: 'streaming',
      errorCode: null,
      runId: null,
      lastEventId: null,
    }
  }

  private removeEntry(entry: Entry): void {
    this.conversation.entries = this.conversation.entries.filter((item) => item !== entry)
    this.persist()
  }

  private persist(): void {
    saveConversation(this.storage, this.storageKey, this.conversation)
  }

  private iconButton(name: 'newChat' | 'close', onClick: () => void): HTMLButtonElement {
    const button = element('button', 'icon-button')
    button.type = 'button'
    button.append(icon(name))
    button.addEventListener('click', onClick)
    return button
  }

  private later(callback: () => void, delay = REATTACH_DELAY_MS): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer)
      callback()
    }, delay)
    this.timers.add(timer)
  }

  private tickCountdown(): void {
    if (this.notice?.kind !== 'rate-limited') return
    this.render()
    this.later(() => {
      this.tickCountdown()
    }, 1000)
  }
}

function safeSessionStorage(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}
