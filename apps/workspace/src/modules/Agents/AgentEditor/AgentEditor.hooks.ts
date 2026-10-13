// SPDX-License-Identifier: AGPL-3.0-only
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'

import { agentQueries, useSaveAgentDraftMutation, useUpdateAgentMutation } from '@/api/agents'
import { ERROR_CODES } from '@surefy/contracts'
import type { AgentDefinition, AgentDetailDto } from '@surefy/contracts'
import { isApiError } from '@surefy/web-core/errors'

import { AUTOSAVE_DELAY_MS } from './AgentEditor.constants'
import {
  clearDeviceDraft,
  isAgentNameValid,
  readDeviceDraft,
  toSaveableDefinition,
  writeDeviceDraft,
} from './AgentEditor.utils'

import type { AgentMetaValues, AgentSaveStatus, DefinitionUpdate } from './AgentEditor.types'

interface AutosaveOptions {
  orgId: string
  agent: AgentDetailDto
  /** Archived, or not the person's to edit: edits are ignored and nothing is saved. */
  isReadOnly: boolean
}

/** What the editor holds now, read by the timer and the save loop; the state below only renders it. */
interface Work {
  definition: AgentDefinition
  meta: AgentMetaValues
  /** The draft revision the next save is based on. */
  revision: number
  isDefinitionDirty: boolean
  isMetaDirty: boolean
  isSaving: boolean
  /** Edits arrived while a save was running: save again once it ends. */
  isQueued: boolean
}

function startingWork(orgId: string, agent: AgentDetailDto): Work {
  const kept = readDeviceDraft(orgId, agent.id, agent.draft.revision)
  return {
    definition: kept ?? agent.draft.definition,
    meta: { name: agent.name, description: agent.description ?? '' },
    revision: agent.draft.revision,
    isDefinitionDirty: kept !== null,
    isMetaDirty: false,
    isSaving: false,
    isQueued: false,
  }
}

/**
 * The working copy of an agent and its autosave (design: Agents › Editor › States). Edits show at
 * once; a save follows `AUTOSAVE_DELAY_MS` after the last one, carrying the revision it was based
 * on. The draft goes to `PUT …/draft`, the name and description to `PATCH …`. A failed save keeps
 * the draft on the device and offers Retry; a draft that moved on the server offers Keep mine
 * (resend on top of their revision) or Review changes (take their draft). Leaving the editor
 * saves what is pending.
 */
export function useAgentAutosave({ orgId, agent, isReadOnly }: AutosaveOptions) {
  const queryClient = useQueryClient()
  const saveDraft = useSaveAgentDraftMutation(orgId, agent.id, { silent: true })
  const updateMeta = useUpdateAgentMutation(orgId, agent.id, { silent: true })
  const [initial] = useState(() => startingWork(orgId, agent))
  const work = useRef<Work>(initial)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const save = useRef<() => Promise<void>>(() => Promise.resolve())
  /** The save that is running, with the one queued behind it; `flush` waits for it. */
  const inFlight = useRef<Promise<void> | null>(null)

  const [definition, setDefinition] = useState(initial.definition)
  const [meta, setMeta] = useState(initial.meta)
  const [status, setStatus] = useState<AgentSaveStatus>({
    kind: 'saved',
    at: agent.draft.updatedAt,
  })

  const schedule = () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void save.current(), AUTOSAVE_DELAY_MS)
  }

  /** Sends the name and description. */
  const sendMeta = async (w: Work) => {
    const sent = w.meta
    await updateMeta.mutateAsync({
      name: sent.name.trim(),
      description: sent.description.trim() === '' ? null : sent.description.trim(),
    })
    if (w.meta === sent) w.isMetaDirty = false
  }

  /** Sends the draft; a draft that cannot be sent waits on this device. Returns when it was saved. */
  const sendDefinition = async (w: Work) => {
    const sent = w.definition
    const saveable = toSaveableDefinition(sent)
    try {
      const saved = await saveDraft.mutateAsync({ baseRevision: w.revision, definition: saveable })
      w.revision = saved.revision
      if (w.definition === sent) {
        w.isDefinitionDirty = false
        clearDeviceDraft(orgId, agent.id)
      }
      return saved.updatedAt
    } catch (error) {
      writeDeviceDraft(orgId, agent.id, { baseRevision: w.revision, definition: saveable })
      throw error
    }
  }

  /** A moved draft shows the conflict; any other failure shows Retry. */
  const showFailure = async (error: unknown) => {
    if (!isApiError(error) || error.code !== ERROR_CODES.AGENT_EDIT_CONFLICT) {
      setStatus({ kind: 'error', error })
      return
    }
    // The conflict's details are not on the error: read the agent as it stands now
    const liveBefore = agent.liveVersion
    const remote = await queryClient
      .query({ ...agentQueries.detail(orgId, agent.id), staleTime: 0 })
      .catch(() => null)
    if (!remote) {
      setStatus({ kind: 'error', error })
      return
    }
    setStatus({
      kind: 'conflict',
      remote,
      publishedVersion: remote.liveVersion === liveBefore ? null : remote.liveVersion,
    })
  }

  const runSave = async () => {
    clearTimeout(timer.current)
    const w = work.current
    if (isReadOnly || (!w.isDefinitionDirty && !w.isMetaDirty)) return
    if (w.isSaving) {
      w.isQueued = true
      return
    }
    // An empty name is not saved: the field says why, and the rest of the draft still is
    const sendsMeta = w.isMetaDirty && isAgentNameValid(w.meta.name)
    if (!sendsMeta && !w.isDefinitionDirty) return

    w.isSaving = true
    setStatus({ kind: 'saving' })
    try {
      if (sendsMeta) await sendMeta(w)
      const savedAt = w.isDefinitionDirty ? await sendDefinition(w) : new Date().toISOString()
      setStatus({ kind: 'saved', at: savedAt })
    } catch (error) {
      await showFailure(error)
      w.isSaving = false
      w.isQueued = false
      return
    }
    w.isSaving = false
    if (w.isQueued) {
      w.isQueued = false
      await save.current()
    }
  }

  // The timer and the unmount cleanup call the save of the latest render
  useEffect(() => {
    save.current = () => {
      const running = runSave()
      inFlight.current = running
      return running
    }
  })

  // Leaving the editor saves what is pending; closing the page asks first
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      const w = work.current
      if (w.isDefinitionDirty || w.isMetaDirty || w.isSaving) event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    if (work.current.isDefinitionDirty) schedule()
    return () => {
      window.removeEventListener('beforeunload', warn)
      clearTimeout(timer.current)
      void save.current()
    }
  }, [])

  const onDefinitionChange = (update: DefinitionUpdate) => {
    if (isReadOnly) return
    const w = work.current
    w.definition = update(w.definition)
    w.isDefinitionDirty = true
    setDefinition(w.definition)
    schedule()
  }

  const onMetaChange = (patch: Partial<AgentMetaValues>) => {
    if (isReadOnly) return
    const w = work.current
    w.meta = { ...w.meta, ...patch }
    w.isMetaDirty = true
    setMeta(w.meta)
    schedule()
  }

  /** Save again after a failure. */
  const retry = () => void save.current()

  /**
   * Saves what is pending, waiting for a save that is running. Returns the revision the draft is
   * at on the server, or null when the latest edits could not be saved.
   */
  const flush = useCallback(async (): Promise<number | null> => {
    clearTimeout(timer.current)
    await inFlight.current
    await save.current()
    return work.current.isDefinitionDirty ? null : work.current.revision
  }, [])

  /** The draft moved to `revision` without an edit of ours: a publish bumps it. */
  const adoptRevision = useCallback((revision: number) => {
    work.current.revision = revision
  }, [])

  /** Keep mine: send this draft on top of their revision. */
  const keepMine = () => {
    if (status.kind !== 'conflict') return
    work.current.revision = status.remote.draft.revision
    work.current.isDefinitionDirty = true
    void save.current()
  }

  /** Review changes: take the draft as it stands on the server. */
  const reviewChanges = () => {
    if (status.kind !== 'conflict') return
    const { remote } = status
    work.current = {
      definition: remote.draft.definition,
      meta: { name: remote.name, description: remote.description ?? '' },
      revision: remote.draft.revision,
      isDefinitionDirty: false,
      isMetaDirty: false,
      isSaving: false,
      isQueued: false,
    }
    clearDeviceDraft(orgId, agent.id)
    setDefinition(remote.draft.definition)
    setMeta(work.current.meta)
    setStatus({ kind: 'saved', at: remote.draft.updatedAt })
  }

  return {
    definition,
    meta,
    status,
    isNameValid: isAgentNameValid(meta.name),
    onDefinitionChange,
    onMetaChange,
    retry,
    keepMine,
    reviewChanges,
    flush,
    adoptRevision,
    /** Another person changed the agent first: shows the conflict, as a failed save would. */
    reportConflict: showFailure,
  }
}
