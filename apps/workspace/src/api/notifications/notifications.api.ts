// SPDX-License-Identifier: AGPL-3.0-only
import type {
  ListNotificationsQuery,
  MarkAllReadResultDto,
  NotificationDto,
  UnreadCountDto,
} from '@surefy/contracts'
import type { HttpClient } from '@surefy/web-core/http'

/** In-app notifications of the signed-in member in one organization. */
export const notificationsApi = {
  list: (http: HttpClient, orgId: string, query: ListNotificationsQuery, signal?: AbortSignal) =>
    http.getPage<NotificationDto>(`/orgs/${orgId}/notifications`, { params: query, signal }),
  unreadCount: (http: HttpClient, orgId: string, signal?: AbortSignal) =>
    http.get<UnreadCountDto>(`/orgs/${orgId}/notifications/unread-count`, { signal }),
  markRead: (http: HttpClient, orgId: string, notificationId: string) =>
    http.post<NotificationDto>(`/orgs/${orgId}/notifications/${notificationId}/read`),
  markAllRead: (http: HttpClient, orgId: string) =>
    http.post<MarkAllReadResultDto>(`/orgs/${orgId}/notifications/read-all`),
}
