import { api } from './client'
import type { PublicSettings, AllSettings } from '../types'

export async function getPublicSettings(): Promise<PublicSettings> {
  const res = await api.get('/settings/public')
  return res.data
}

export async function getAllSettings(): Promise<AllSettings> {
  const res = await api.get('/settings')
  return res.data.settings
}

export async function updateSettings(settings: Record<string, string>): Promise<void> {
  await api.put('/settings', { settings })
}

export async function testEmail(to: string): Promise<void> {
  await api.post('/settings/test-email', { to })
}

export async function uploadAsset(type: 'logo' | 'favicon', file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const res = await api.post(`/assets/upload?type=${type}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data.url
}

export async function deleteAsset(type: 'logo' | 'favicon'): Promise<void> {
  await api.delete(`/assets/${type}`)
}

export async function getDiskStats(): Promise<{ total: number; used: number; free: number; pct: number; nextExpiryAt: string | null }> {
  const res = await api.get('/settings/disk-stats')
  return res.data
}
