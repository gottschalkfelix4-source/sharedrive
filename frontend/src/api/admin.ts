import { api } from './client'
import type { AdminStats, AdminTransferRow, AdminUser } from '../types'

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
