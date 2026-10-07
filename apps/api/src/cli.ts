// SPDX-License-Identifier: AGPL-3.0-only
import { parseArgs } from 'node:util'

import { createContainer, type Container } from './container.js'
import { loadConfig } from './core/config/index.js'

/**
 * Operator commands of a self-hosted install, run next to the worker with the same environment:
 * `docker compose exec worker node dist/cli.js <command>` (`pnpm cli <command>` in development).
 * Every change a command makes is audited like the same change made by a job.
 */
const USAGE = `Usage: cli <command>

  keys status                      Data key versions per organization and the master keys in use
  keys rotate --org <id|slug>      Rotate one organization's data key and re-encrypt its secrets
  keys rotate --all                Rotate every organization's data key
  keys rewrap                      Re-wrap every data key with ENCRYPTION_KEY after a master key
                                   change (needs ENCRYPTION_KEY_PREVIOUS); then remove the previous key
`

const print = (line: string) => process.stdout.write(`${line}\n`)

type Keys = Container['modules']['vault']['keys']

async function keysStatus(container: Container): Promise<number> {
  const current = container.modules.vault.crypto.masterKeys.current.id
  print(`ENCRYPTION_KEY id: ${current}`)
  for (const row of await container.modules.vault.keys.status()) {
    const retired = row.retiredVersions.length > 0 ? row.retiredVersions.join(', ') : '-'
    const stale = row.masterKeyIds.some((id) => id !== current) ? ' (needs rewrap)' : ''
    print(`${row.slug}  active v${String(row.activeVersion ?? '-')}  retired ${retired}${stale}`)
  }
  return 0
}

/** The organizations `--all` or `--org` names; a message when they name none. */
async function rotationTargets(
  keys: Keys,
  options: { org?: string; all: boolean },
): Promise<string[] | string> {
  if (options.all) return (await keys.status()).map((row) => row.organizationId)
  if (options.org === undefined) return USAGE
  const orgId = await keys.findOrganization(options.org)
  return orgId === undefined ? `No organization ${options.org}` : [orgId]
}

async function keysRotate(keys: Keys, options: { org?: string; all: boolean }): Promise<number> {
  const targets = await rotationTargets(keys, options)
  if (typeof targets === 'string') {
    print(targets)
    return 1
  }
  for (const orgId of targets) {
    const rotated = await keys.rotate(orgId)
    const result = await keys.reencrypt(orgId)
    const deleted = (result.deleted[orgId] ?? []).map((version) => 'v' + String(version))
    print(
      `${orgId}: v${String(rotated.retiredVersion)} → v${String(rotated.version)}, ` +
        `${String(result.secrets)} secrets re-encrypted, ` +
        `retired keys deleted: ${deleted.length > 0 ? deleted.join(', ') : 'none'}`,
    )
  }
  return 0
}

async function keysRewrap(container: Container): Promise<number> {
  if (container.modules.vault.crypto.masterKeys.previous === undefined) {
    print('Set ENCRYPTION_KEY_PREVIOUS to the master key being replaced, then run it again.')
    return 1
  }
  const result = await container.modules.vault.keys.rewrap()
  print(
    `${String(result.keys)} data keys in ${String(result.organizations)} organizations re-wrapped, ` +
      `${String(result.fingerprints)} fingerprints recomputed, ` +
      `install key ${result.installKey ? 're-wrapped' : 'unchanged'}. ` +
      'Remove ENCRYPTION_KEY_PREVIOUS once `keys status` shows nothing to re-wrap.',
  )
  return 0
}

async function keysCommand(container: Container, args: string[]): Promise<number> {
  const { positionals, values } = parseArgs({
    args,
    allowPositionals: true,
    options: { org: { type: 'string' }, all: { type: 'boolean', default: false } },
  })
  switch (positionals[0]) {
    case 'status':
      return keysStatus(container)
    case 'rotate':
      return keysRotate(container.modules.vault.keys, values)
    case 'rewrap':
      return keysRewrap(container)
    default:
      print(USAGE)
      return 1
  }
}

async function main(argv: string[]): Promise<number> {
  const [group, ...rest] = argv
  if (group !== 'keys') {
    print(USAGE)
    return 1
  }
  const container = await createContainer(loadConfig('cli'))
  try {
    return await keysCommand(container, rest)
  } finally {
    await container.close()
  }
}

process.exitCode = await main(process.argv.slice(2))
