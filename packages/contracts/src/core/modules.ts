// SPDX-License-Identifier: AGPL-3.0-only
/** Product modules that plans, licenses, organizations and teams can switch on or off. */
export const MODULES = [
  'chat',
  'agents',
  'flows',
  'knowledge',
  'train',
  'pieces',
  'insights',
  'guard',
] as const
export type ModuleKey = (typeof MODULES)[number]
