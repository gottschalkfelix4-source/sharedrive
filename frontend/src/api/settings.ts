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
