// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

/** The slice of the browser's speech recognition the composer uses (not in the DOM typings). */
interface SpeechRecognitionResultLike {
  readonly isFinal: boolean
  readonly 0: { readonly transcript: string }
}

interface SpeechRecognitionEventLike {
  readonly resultIndex: number
  readonly results: ArrayLike<SpeechRecognitionResultLike>
}

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { readonly error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

/** Errors that mean the person said no, or that the browser cannot listen at all. */
export type VoiceError = 'denied' | 'unavailable' | 'failed'

const DENIED_ERRORS = ['not-allowed', 'service-not-allowed']
const UNAVAILABLE_ERRORS = ['audio-capture', 'language-not-supported']

/** Where the browser keeps its speech recognition, if it has one (Chromium and Safari prefix it). */
function getRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null
}

const subscribeNever = () => () => {
  // support does not change while the page is open
}

/** Whether the browser can recognize speech; false while rendering on the server. */
export function useIsSpeechSupported(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => getRecognitionConstructor() !== null,
    () => false,
  )
}

/**
 * Dictation with the browser's speech recognition (chat.md §3). While listening, the words heard so
 * far go to `onTranscript` as `base + transcript`, where `base` is what was written when it
 * started, so the person can keep editing between sessions. Stops by itself when the browser ends
 * the session.
 */
export function useDictation({
  lang,
  getText,
  onTranscript,
}: {
  lang: string
  /** The composer's current text, read when dictation starts. */
  getText: () => string
  onTranscript: (text: string) => void
}) {
  const recognition = useRef<SpeechRecognitionLike | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState<VoiceError | null>(null)

  useEffect(
    () => () => {
      recognition.current?.abort()
    },
    [],
  )

  const stop = () => {
    recognition.current?.stop()
  }

  const start = () => {
    const Recognition = getRecognitionConstructor()
    if (!Recognition || isListening) return
    const base = getText().trimEnd()
    const session = new Recognition()
    session.lang = lang
    session.continuous = true
    session.interimResults = true
    session.onresult = (event) => {
      const heard = Array.from(event.results, (result) => result[0].transcript)
        .join(' ')
        .trim()
      onTranscript(base === '' ? heard : `${base} ${heard}`.trimEnd())
    }
    session.onerror = ({ error: code }) => {
      if (code === 'no-speech' || code === 'aborted') return
      if (DENIED_ERRORS.includes(code)) setError('denied')
      else setError(UNAVAILABLE_ERRORS.includes(code) ? 'unavailable' : 'failed')
    }
    session.onend = () => {
      recognition.current = null
      setIsListening(false)
    }
    recognition.current = session
    setError(null)
    setIsListening(true)
    session.start()
  }

  return {
    isListening,
    error,
    start,
    stop,
    clearError: () => {
      setError(null)
    },
  }
}
