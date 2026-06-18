import { api } from './client'
import type { Transfer, TransferUploadResult } from '../types'

export interface UploadOptions {
  title?: string
  message?: string
  password?: string
  expiresInDays?: number
  notifyEmail?: string
  onProgress?: (percent: number, speed: string, eta: string) => void
}

export async function uploadTransfer(
  files: File[],
  options: UploadOptions
): Promise<TransferUploadResult> {
  const formData = new FormData()
  files.forEach((f) => formData.append('files', f))
  if (options.title) formData.append('title', options.title)
  if (options.message) formData.append('message', options.message)
  if (options.password) formData.append('password', options.password)
  if (options.expiresInDays) formData.append('expiresInDays', String(options.expiresInDays))
  if (options.notifyEmail) formData.append('notifyEmail', options.notifyEmail)

  const startTime = Date.now()

  const res = await api.post('/transfers', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 0,
    onUploadProgress: (e) => {
      if (!options.onProgress || !e.total) return
      const percent = Math.round((e.loaded / e.total) * 100)
      const elapsed = (Date.now() - startTime) / 1000
      const speed = e.loaded / elapsed
      const remaining = ((e.total - e.loaded) / speed).toFixed(0)
      options.onProgress(
        percent,
        formatBytes(speed) + '/s',
        remaining + 's'
      )
    },
  })
  return res.data
}

export async function getTransfer(shortId: string, password?: string): Promise<any> {
  const headers: Record<string, string> = {}
  if (password) headers['x-transfer-password'] = password
  const res = await api.get(`/d/${shortId}`, { headers })
  return res.data
}

export async function getMyTransfers(page = 1): Promise<{ transfers: Transfer[]; total: number; pages: number }> {
  const res = await api.get(`/transfers/mine?page=${page}`)
  return res.data
}

export async function deleteTransfer(shortId: string): Promise<void> {
  await api.delete(`/transfers/${shortId}`)
}

export function getDownloadUrl(shortId: string, fileId: string): string {
  return `/api/d/${shortId}/files/${fileId}`
}

export function getZipUrl(shortId: string): string {
  return `/api/d/${shortId}/zip`
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB'
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB'
  if (bytes >= 1e3) return (bytes / 1e3).toFixed(1) + ' KB'
  return bytes + ' B'
}
