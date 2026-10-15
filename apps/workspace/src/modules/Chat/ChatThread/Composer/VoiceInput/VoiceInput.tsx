// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Mic, MicOff } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'

import { cn } from '@surefy/ui/lib/utils'
import { Button } from '@surefy/ui/primitives/button'
import { Popover, PopoverAnchor, PopoverContent } from '@surefy/ui/primitives/popover'

import { useDictation, useIsSpeechSupported } from './VoiceInput.hooks'
import { VOICE_NOTICE_KEY } from '../../ChatThread.constants'

const readNoticeSeen = (): boolean => {
  try {
    return window.localStorage.getItem(VOICE_NOTICE_KEY) === 'true'
  } catch {
    return false
  }
}

const rememberNotice = () => {
  try {
    window.localStorage.setItem(VOICE_NOTICE_KEY, 'true')
  } catch {
    // storage is blocked: the notice shows again next time
  }
}

export interface VoiceInputProps {
  text: string
  isDisabled: boolean
  onTextChange: (text: string) => void
}

/**
 * Voice input (chat.md §3): dictation into the composer with the browser's speech recognition. The
 * transcript lands in the text box, editable before sending. The first use says the browser may
 * send audio to its own speech service. Hidden when the browser cannot recognize speech.
 */
export default function VoiceInput({ text, isDisabled, onTextChange }: Readonly<VoiceInputProps>) {
  const t = useTranslations('chat.thread.composer.voice')
  const locale = useLocale()
  const isSupported = useIsSpeechSupported()
  const [isNoticeOpen, setIsNoticeOpen] = useState(false)
  const dictation = useDictation({ lang: locale, getText: () => text, onTranscript: onTextChange })

  if (!isSupported) return null

  const onToggle = () => {
    if (dictation.isListening) dictation.stop()
    else if (readNoticeSeen()) dictation.start()
    else setIsNoticeOpen(true)
  }

  return (
    <Popover
      open={isNoticeOpen || dictation.error !== null}
      onOpenChange={(open) => {
        if (open) return
        setIsNoticeOpen(false)
        dictation.clearError()
      }}
    >
      <PopoverAnchor asChild>
        <Button
          variant="ghost"
          size="icon-md"
          aria-label={dictation.isListening ? t('stop') : t('start')}
          aria-pressed={dictation.isListening}
          disabled={isDisabled}
          className={cn('size-8 rounded-full', dictation.isListening && 'text-destructive')}
          onClick={onToggle}
        >
          {dictation.error ? <MicOff aria-hidden /> : <Mic aria-hidden />}
        </Button>
      </PopoverAnchor>
      <PopoverContent align="end" side="top" className="flex w-72 flex-col gap-3">
        {dictation.error ? (
          <>
            <p role="alert" className="text-body">
              {t(`errors.${dictation.error}`)}
            </p>
            <Button size="sm" className="self-end" onClick={dictation.clearError}>
              {t('close')}
            </Button>
          </>
        ) : (
          <>
            <p className="text-body">{t('notice')}</p>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setIsNoticeOpen(false)
                }}
              >
                {t('cancel')}
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  rememberNotice()
                  setIsNoticeOpen(false)
                  dictation.start()
                }}
              >
                {t('continue')}
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
