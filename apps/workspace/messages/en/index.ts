// SPDX-License-Identifier: AGPL-3.0-only
// The workspace's own namespaces in English, one per module; every locale has the same files.
import auth from './auth.json'
import chat from './chat.json'
import guard from './guard.json'
import insights from './insights.json'
import knowledge from './knowledge.json'
import settings from './settings.json'
import setup from './setup.json'
import vault from './vault.json'
import workspace from './workspace.json'

const messages = { workspace, auth, setup, chat, knowledge, insights, guard, vault, settings }

export default messages
