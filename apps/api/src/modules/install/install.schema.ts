// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import {
  addInstallAdminInputSchema,
  installAdminDtoSchema,
  installAdminParamsSchema,
  installOrganizationDtoSchema,
  installSettingsDtoSchema,
  listInstallOrganizationsQuerySchema,
  okResponse,
  pageResponse,
  sendTestEmailInputSchema,
  updateInstallSettingsInputSchema,
} from '@surefy/contracts'

const TAGS = ['install']

export const getInstallSettingsRoute = {
  tags: TAGS,
  summary: 'Get the install settings',
  response: { 200: okResponse(installSettingsDtoSchema) },
}

export const updateInstallSettingsRoute = {
  tags: TAGS,
  summary: 'Update sign-up, organization creation, sign-in methods, email server and web search',
  body: updateInstallSettingsInputSchema,
  response: { 200: okResponse(installSettingsDtoSchema) },
}

export const sendTestEmailRoute = {
  tags: TAGS,
  summary: 'Send a test email with the stored email server settings',
  body: sendTestEmailInputSchema,
}

export const listInstallAdminsRoute = {
  tags: TAGS,
  summary: 'List the install administrators',
  response: { 200: okResponse(z.array(installAdminDtoSchema)) },
}

export const addInstallAdminRoute = {
  tags: TAGS,
  summary: 'Make a person an install administrator',
  body: addInstallAdminInputSchema,
  response: { 201: okResponse(installAdminDtoSchema) },
}

export const removeInstallAdminRoute = {
  tags: TAGS,
  summary: 'Remove an install administrator; at least one remains',
  params: installAdminParamsSchema,
}

export const listInstallOrganizationsRoute = {
  tags: TAGS,
  summary: 'List every organization on the install',
  querystring: listInstallOrganizationsQuerySchema,
  response: { 200: pageResponse(installOrganizationDtoSchema) },
}
