// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test'

import { ORGANIZATION, OWNER } from './support/env'

import type { Page } from '@playwright/test'

const SETTINGS = `/${ORGANIZATION.slug}/settings`
const stamp = String(Date.now())

/** Visits a section and waits for its heading (`next dev` compiles each page on its first visit). */
async function openSection(page: Page, section: string, heading: string) {
  await page.goto(`${SETTINGS}/${section}`)
  await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
}

// Each section changes what it needs and puts it back, so the other specs find the install as setup left it.

test.describe('Settings › navigation', () => {
  test('lists every section of the MVP in the Settings dropdown, which opens the first', async ({
    page,
  }) => {
    await page.goto(`/${ORGANIZATION.slug}/profile`)
    const navigation = page.getByRole('navigation', { name: 'Main navigation' })
    await navigation.getByRole('button', { name: 'Settings' }).click()
    for (const name of [
      'General',
      'Members',
      'Teams',
      'Roles & access',
      'Vault',
      'Data & privacy',
      'Security',
      'Install',
    ]) {
      await expect(navigation.getByRole('link', { name })).toBeVisible()
    }
    await navigation.getByRole('link', { name: 'General' }).click()
    // the first visit of Settings compiles its pages under `next dev`, which can take a while
    await expect(page).toHaveURL(`${SETTINGS}/general`, { timeout: 60_000 })
    // on a settings page the dropdown stays open with the open section marked
    await expect(navigation.getByRole('link', { name: 'General' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })
})

test.describe('Settings › General', () => {
  test('saves a new organization name and shows it everywhere', async ({ page }) => {
    await openSection(page, 'general', 'General')
    const name = page.getByRole('textbox', { name: 'Name' })
    await expect(name).toHaveValue(ORGANIZATION.name)
    // the save bar appears with the first change
    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0)

    await name.fill(`${ORGANIZATION.name} ${stamp}`)
    await expect(page.getByText('1 unsaved change')).toBeVisible()
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Settings saved')).toBeVisible()

    await page.reload()
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue(
      `${ORGANIZATION.name} ${stamp}`,
    )
    // the sidebar's user button shows the organization's name under the person's
    await expect(page.getByRole('button', { name: /Account menu for/ })).toContainText(
      `${ORGANIZATION.name} ${stamp}`,
    )

    await page.getByRole('textbox', { name: 'Name' }).fill(ORGANIZATION.name)
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Settings saved')).toBeVisible()
  })

  test('asks before changing the address, and keeps it when cancelled', async ({ page }) => {
    await openSection(page, 'general', 'General')
    await page.getByRole('textbox', { name: 'URL address' }).fill(`${ORGANIZATION.slug}-new`)
    await page.getByRole('button', { name: 'Save changes' }).click()

    const dialog = page.getByRole('alertdialog', {
      name: `Change the address to ${ORGANIZATION.slug}-new?`,
    })
    await expect(dialog.getByText(/Bookmarks and shared links/)).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
    await expect(page).toHaveURL(`${SETTINGS}/general`)
  })
})

test.describe('Settings › Members', () => {
  const email = `invitee-${stamp}@e2e.test`

  test('lists the Owner who set the install up', async ({ page }) => {
    await openSection(page, 'members', 'Members')
    const row = page
      .getByRole('table', { name: 'Members' })
      .getByRole('row')
      .filter({ hasText: OWNER.name })
    await expect(row).toContainText('Owner')
    await expect(row).toContainText('Active')
  })

  test('invites a person, lists the invitation, and revokes it', async ({ page }) => {
    await openSection(page, 'members', 'Members')
    await page.getByRole('button', { name: 'Invite people' }).click()
    const dialog = page.getByRole('dialog', { name: 'Invite people' })
    await dialog.getByRole('textbox', { name: 'Email addresses' }).fill(email)
    await dialog.getByRole('button', { name: 'Send invitation' }).click()
    await expect(dialog.getByText('Invitation created')).toBeVisible()
    await dialog.getByRole('button', { name: 'Done' }).click()

    const table = page.getByRole('table', { name: 'Members' })
    const row = table.getByRole('row').filter({ hasText: email })
    await expect(row).toContainText('Invited')

    await row.getByRole('button', { name: `Actions for ${email}` }).click()
    await page.getByRole('menuitem', { name: 'Revoke invitation' }).click()
    await page
      .getByRole('alertdialog', { name: `Revoke the invitation for ${email}?` })
      .getByRole('button', { name: 'Revoke invitation' })
      .click()
    await expect(table.getByRole('row').filter({ hasText: email })).toHaveCount(0)
  })
})

test.describe('Settings › Teams', () => {
  const team = `Support ${stamp}`

  test('creates a team, adds a person, and deletes it', async ({ page }) => {
    await openSection(page, 'teams', 'Teams')
    await page.getByRole('button', { name: 'Create team' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Create team' })
    await dialog.getByRole('textbox', { name: 'Name' }).fill(team)
    await dialog.getByRole('button', { name: 'Create team' }).click()
    await expect(page.getByText(`${team} was created`)).toBeVisible()

    const table = page.getByRole('table', { name: 'Teams' })
    await table.getByRole('link', { name: team }).click()
    await expect(page.getByRole('heading', { name: team })).toBeVisible()
    await expect(page.getByText('No one is in this team yet.')).toBeVisible()

    await page.getByRole('combobox', { name: 'Add people' }).click()
    await page.getByRole('option', { name: new RegExp(OWNER.name) }).click()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: /^Add 1 person$/ }).click()
    await expect(page.getByText('1 person added')).toBeVisible()
    await expect(page.getByRole('heading', { name: '1 member' })).toBeVisible()

    await page.getByRole('button', { name: 'Delete team' }).click()
    await page
      .getByRole('alertdialog', { name: `Delete ${team}?` })
      .getByRole('button', { name: 'Delete team' })
      .click()
    await expect(page.getByText(`${team} was deleted`)).toBeVisible()
  })
})

test.describe('Settings › Roles & access', () => {
  test('shows what each role can do and the effective access of a person', async ({ page }) => {
    await openSection(page, 'access', 'Roles & access')
    const capabilities = page.getByRole('table', { name: 'Capabilities by role' })
    const invite = capabilities.getByRole('row').filter({ hasText: 'Invite people' })
    await expect(invite.getByRole('cell')).toHaveText([
      'Invite people',
      'Not allowed',
      'Not allowed',
      'Allowed',
      'Allowed',
    ])

    const effective = page.getByRole('region', { name: 'Effective access' })
    await effective.getByRole('combobox', { name: 'Person or team' }).click()
    await page.getByRole('option', { name: new RegExp(OWNER.name) }).click()
    await expect(effective).toContainText(OWNER.name)
    await expect(effective.getByText('Modules')).toBeVisible()
    await expect(
      page.getByRole('heading', { name: /Custom roles are part of SurefyOS Enterprise/ }),
    ).toBeVisible()
  })
})

test.describe('Settings › Data & privacy', () => {
  test('shows retention and switches chat sharing off and on', async ({ page }) => {
    await openSection(page, 'data-privacy', 'Data & privacy')
    const retention = page.getByRole('region', { name: 'Storage and retention' })
    await expect(retention).toContainText('Your data is stored on your server.')
    await expect(retention).toContainText('Audit log')

    const sharing = page.getByRole('switch', { name: 'Chat sharing' })
    await expect(sharing).toBeChecked()
    await sharing.click()
    await expect(page.getByText('Privacy settings saved')).toBeVisible()
    await page.reload()
    await expect(page.getByRole('switch', { name: 'Chat sharing' })).not.toBeChecked()
    await page.getByRole('switch', { name: 'Chat sharing' }).click()
    await expect(page.getByRole('switch', { name: 'Chat sharing' })).toBeChecked()
  })

  test('requests an export of all data', async ({ page }) => {
    await openSection(page, 'data-privacy', 'Data & privacy')
    await page.getByRole('button', { name: 'Request export' }).click()
    await page
      .getByRole('alertdialog', { name: 'Export all data?' })
      .getByRole('button', { name: 'Request export' })
      .click()
    await expect(page.getByRole('list', { name: 'Exports' }).getByRole('listitem')).toHaveCount(1)
  })

  test('asks for the name and a reason before deleting the organization, and deletes nothing here', async ({
    page,
  }) => {
    await openSection(page, 'data-privacy', 'Data & privacy')
    await page.getByRole('button', { name: 'Delete organization' }).click()
    const dialog = page.getByRole('alertdialog', { name: `Delete ${ORGANIZATION.name}?` })
    await expect(dialog.getByText(/After a 30-day hold, all data is removed/)).toBeVisible()

    await dialog.getByRole('button', { name: 'Delete organization' }).click()
    await expect(dialog.getByText('Enter a reason')).toBeVisible()
    await expect(
      dialog.getByText(`The name does not match. Type ${ORGANIZATION.name}`),
    ).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('button', { name: 'Delete organization' })).toBeVisible()
  })
})

test.describe('Settings › Security', () => {
  test('shows the Enterprise items as gate cards, and saves the session length', async ({
    page,
  }) => {
    await openSection(page, 'security', 'Security')
    await expect(
      page.getByRole('heading', { name: 'Single sign-on is part of SurefyOS Enterprise' }),
    ).toBeVisible()
    await expect(
      page.getByRole('switch', { name: 'Require two-step verification' }),
    ).not.toBeChecked()

    await page.getByRole('combobox', { name: 'Session length' }).click()
    await page.getByRole('option', { name: '8 hours' }).click()
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Security settings saved')).toBeVisible()

    await page.reload()
    await expect(page.getByRole('combobox', { name: 'Session length' })).toContainText('8 hours')
    await page.getByRole('combobox', { name: 'Session length' }).click()
    await page.getByRole('option', { name: 'Default (7 days)' }).click()
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Security settings saved')).toBeVisible()
  })
})

test.describe('Settings › Install', () => {
  test('shows the version, the organizations and who administers the install', async ({ page }) => {
    await openSection(page, 'install', 'Install')
    await expect(page.getByRole('region', { name: 'Version' })).toContainText('SurefyOS')
    const organizations = page.getByRole('list', { name: 'Organizations' })
    await expect(organizations).toContainText(ORGANIZATION.name)

    const admins = page.getByRole('list', { name: 'Install administrators' })
    await expect(admins).toContainText(OWNER.name)
    await expect(page.getByRole('button', { name: 'Add administrator' })).toBeDisabled()
    await expect(page.getByRole('switch', { name: 'Email and password' })).toBeChecked()
  })
})
