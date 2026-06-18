import { api } from './client'
import type { AdminStats, AdminTransferRow, AdminUser } from '../types'

export interface LogEntry {
  id: number
  createdAt: string
  level: 'info' | 'warn' | 'error'
  category: string
  message: string
  ip?: string
  userId?: string
  meta?: Record<string, unknown>
}

export async function getAdminStats(): Promise<AdminStats> {
  const res = await api.get('/admin/stats')
  return res.data
}

export async function getAdminTransfers(page = 1, search = '', status = ''): Promise<{
  transfers: AdminTransferRow[]
  total: number
  pages: number
}> {
  const params = new URLSearchParams({ page: String(page) })
  if (search) params.set('search', search)
  if (status) params.set('status', status)
  const res = await api.get(`/admin/transfers?${params}`)
  return res.data
}

export async function deleteAdminTransfer(shortId: string): Promise<void> {
  await api.delete(`/admin/transfers/${shortId}`)
}

export async function getAdminUsers(page = 1): Promise<{ users: AdminUser[]; total: number; pages: number }> {
  const res = await api.get(`/admin/users?page=${page}`)
  return res.data
}

export async function updateUserRole(id: string, role: 'USER' | 'ADMIN'): Promise<void> {
  await api.put(`/admin/users/${id}`, { role })
}

export async function deleteUser(id: string): Promise<void> {
  await api.delete(`/admin/users/${id}`)
}

export async function getDiagToken(): Promise<{ token: string }> {
  const res = await api.get('/admin/diag-token')
  return res.data
}

export interface LiveStats {
  activeUploads: number
  activeDownloads: number
  visitorsOnline: number
  uploadLocations: Array<{ lat: number; lon: number; city: string; country: string; count: number }>
}

export async function getLiveStats(): Promise<LiveStats> {
  const res = await api.get('/admin/live-stats')
  return res.data
}

export async function getLogs(params: {
  page?: number
  level?: string
  category?: string
  search?: string
}): Promise<{ logs: LogEntry[]; total: number; pages: number }> {
  const p = new URLSearchParams({ page: String(params.page ?? 1) })
  if (params.level) p.set('level', params.level)
  if (params.category) p.set('category', params.category)
  if (params.search) p.set('search', params.search)
  const res = await api.get(`/admin/logs?${p}`)
  return res.data
}
