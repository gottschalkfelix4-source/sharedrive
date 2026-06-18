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

const CHUNK_SIZE  = 8 * 1024 * 1024  // 8 MB — above MinIO's 5 MB minimum part size
const CONCURRENCY = 6                 // sliding-window slots

// Sliding-window scheduler: keeps exactly `limit` requests in-flight at all
// times. As soon as one slot frees up the next task starts immediately —
// no gap between batches like Promise.all-in-batches would cause.
async function withConcurrency(
  count: number,
  fn: (index: number) => Promise<void>,
): Promise<void> {
  const pending = new Set<Promise<void>>()
  let i = 0

  const launch = () => {
    while (pending.size < CONCURRENCY && i < count) {
      const idx = i++
      const p: Promise<void> = fn(idx).finally(() => {
        pending.delete(p)
        launch()
      })
      pending.add(p)
    }
  }

  launch()
  // Wait until all in-flight tasks finish
  while (pending.size > 0) await Promise.race(pending)
}

export async function uploadTransfer(
  files: File[],
  options: UploadOptions,
): Promise<TransferUploadResult> {
  const startTime  = Date.now()
  const totalBytes = files.reduce((s, f) => s + f.size, 0)
  let uploadedBytes = 0

  const tick = (bytes: number) => {
    uploadedBytes += bytes
    if (!options.onProgress || totalBytes === 0) return
    const pct    = Math.min(99, Math.round((uploadedBytes / totalBytes) * 100))
    const elapsed = (Date.now() - startTime) / 1000 || 0.001
    const speed   = uploadedBytes / elapsed
    const remSec  = speed > 0 ? Math.round((totalBytes - uploadedBytes) / speed) : 0
    options.onProgress(pct, formatBytes(speed) + '/s', remSec + 's')
  }

  // ── 1. Init ─────────────────────────────────────────────────────────────────
  const initRes = await api.post('/transfers/chunked/init', {
    title:         options.title        || undefined,
    message:       options.message      || undefined,
    password:      options.password     || undefined,
    expiresInDays: options.expiresInDays,
    notifyEmail:   options.notifyEmail  || undefined,
    files: files.map((f) => ({
      name:     f.name,
      size:     f.size,
      mimeType: f.type || 'application/octet-stream',
    })),
  })

  const { shortId, fileTokens } = initRes.data as { shortId: string; fileTokens: string[] }

  // ── 2. Stream chunks with sliding-window concurrency ────────────────────────
  try {
    for (let fi = 0; fi < files.length; fi++) {
      const file      = files[fi]
      const fileToken = fileTokens[fi]
      const numChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE))

      await withConcurrency(numChunks, async (idx) => {
        const start = idx * CHUNK_SIZE
        const end   = Math.min(start + CHUNK_SIZE, file.size)

        // Send Blob directly — no ArrayBuffer copy, Axios streams it as-is
        await api.put(`/transfers/chunked/${shortId}/part`, file.slice(start, end), {
          headers: {
            'Content-Type':  'application/octet-stream',
            'x-file-token':  fileToken,
            'x-part-number': String(idx + 1),
          },
          timeout: 0,
        })

        tick(end - start)
      })
    }
  } catch (err) {
    api.delete(`/transfers/chunked/${shortId}`).catch(() => {})
    throw err
  }

  // ── 3. Finalize ──────────────────────────────────────────────────────────────
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
