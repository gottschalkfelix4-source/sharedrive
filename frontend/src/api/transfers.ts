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

// ─── Chunked upload (default) ─────────────────────────────────────────────────
// Files are split into CHUNK_SIZE slices and uploaded in parallel batches.
// Uses MinIO multipart API on the backend for full streaming + parallelism.

const CHUNK_SIZE = 8 * 1024 * 1024   // 8 MB — above MinIO's 5 MB minimum part size
const CONCURRENCY = 4                 // parallel chunk requests per upload

export async function uploadTransfer(
  files: File[],
  options: UploadOptions,
): Promise<TransferUploadResult> {
  const startTime  = Date.now()
  const totalBytes = files.reduce((s, f) => s + f.size, 0)
  let uploadedBytes = 0

  const tick = (added: number) => {
    uploadedBytes += added
    if (!options.onProgress || totalBytes === 0) return
    const pct     = Math.min(99, Math.round((uploadedBytes / totalBytes) * 100))
    const elapsed = (Date.now() - startTime) / 1000 || 0.001
    const speed   = uploadedBytes / elapsed
    const remSec  = speed > 0 ? Math.round((totalBytes - uploadedBytes) / speed) : 0
    options.onProgress(pct, formatBytes(speed) + '/s', remSec + 's')
  }

  // ── 1. Init: create session + MinIO multipart uploads ──────────────────────
  const initRes = await api.post('/transfers/chunked/init', {
    title:        options.title        || undefined,
    message:      options.message      || undefined,
    password:     options.password     || undefined,
    expiresInDays: options.expiresInDays,
    notifyEmail:  options.notifyEmail  || undefined,
    files: files.map((f) => ({
      name:     f.name,
      size:     f.size,
      mimeType: f.type || 'application/octet-stream',
    })),
  })

  const { shortId, fileTokens } = initRes.data as { shortId: string; fileTokens: string[] }

  // ── 2. Upload chunks (files one by one, chunks in parallel per file) ────────
  try {
    for (let fi = 0; fi < files.length; fi++) {
      const file      = files[fi]
      const fileToken = fileTokens[fi]
      const numChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE))

      for (let base = 0; base < numChunks; base += CONCURRENCY) {
        const batch = Array.from(
          { length: Math.min(CONCURRENCY, numChunks - base) },
          (_, j) => base + j,
        )
        await Promise.all(
          batch.map(async (idx) => {
            const start  = idx * CHUNK_SIZE
            const end    = Math.min(start + CHUNK_SIZE, file.size)
            const buffer = await file.slice(start, end).arrayBuffer()

            await api.put(`/transfers/chunked/${shortId}/part`, buffer, {
              headers: {
                'Content-Type':  'application/octet-stream',
                'x-file-token':  fileToken,
                'x-part-number': String(idx + 1),  // parts are 1-indexed
              },
              timeout: 0,
            })

            tick(end - start)
          }),
        )
      }
    }
  } catch (err) {
    // Clean up incomplete MinIO multipart uploads
    api.delete(`/transfers/chunked/${shortId}`).catch(() => {})
    throw err
  }

  // ── 3. Finalize: complete multipart uploads + write DB record ───────────────
  const finalRes = await api.post(`/transfers/chunked/${shortId}/finalize`)
  options.onProgress?.(100, '—', '0s')
  return finalRes.data
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
