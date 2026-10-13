// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Plus } from 'lucide-react'

import AddConnectionDialog from '@/modules/Settings/ConnectionsSettings/ConnectionDialogs/AddConnectionDialog'
import { Combobox } from '@surefy/ui/components/Forms'
import { Button } from '@surefy/ui/primitives/button'

import { NO_CONNECTION } from '../ToolsTab.constants'
import { useConnectionPickerController } from './ConnectionPicker.controller'

import type { ConnectionPickerProps } from './ConnectionPicker.types'

/**
 * "Accounts I may use": the connections of one kind of tool, with their state, and Add connection
 * at the end (connections.md §5). A connection added here is picked at once.
 */
export default function ConnectionPicker({
  kind,
  connections,
  value,
  onValueChange,
  isLoading,
  noneLabel,
  ...fieldProps
}: Readonly<ConnectionPickerProps>) {
  const c = useConnectionPickerController({ kind, onValueChange })
  const { t } = c
  const options = [
    ...(noneLabel === undefined ? [] : [{ value: NO_CONNECTION, label: noneLabel }]),
    ...connections.map((connection) => ({
      value: connection.id,
      label: connection.name,
      description: [
        c.providerName(connection.providerKey),
        connection.status === 'active' ? null : t(`status.${connection.status}`),
      ]
        .filter((part) => part !== null)
        .join(' · '),
    })),
  ]

  return (
    <div className="flex flex-col items-start gap-2">
      <Combobox
        {...fieldProps}
        className="w-full"
        options={options}
        labels={{
          placeholder: t('placeholder'),
          search: t('search'),
          empty: t('empty'),
          loading: t('loading'),
        }}
        value={value ?? (noneLabel === undefined ? null : NO_CONNECTION)}
        onValueChange={(next) => {
          onValueChange(next === null || next === NO_CONNECTION ? null : next)
        }}
        isLoading={isLoading}
      />
      <Button type="button" variant="ghost" size="sm" icon={Plus} onClick={c.onOpenAdd}>
        {t('add')}
      </Button>
      {c.isAdding && (
        // The dialog is a portal inside the tool's form: React would pass its submit on to that
        // form, which must not save the tool
        <div
          role="presentation"
          onSubmit={(event) => {
            event.stopPropagation()
          }}
        >
          <AddConnectionDialog
            orgId={c.orgId}
            canManage={c.canManage}
            providerName={c.providerName}
            initialProviderKey={c.providerKey}
            returnTo={c.returnTo}
            onConnected={c.onConnected}
            onClose={c.onCloseAdd}
          />
        </div>
      )}
    </div>
  )
}
