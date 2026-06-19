import { api } from './client'
import type { Transfer, TransferUploadResult, DownloadLogEntry } from '../types'
import { generateKey, exportKey, encryptChunk, CHUNK_SIZE } from '@/lib/e2e'

export interface UploadOptions {
  title?: string
  message?: string
  password?: string
  expiresInDays?: number
  notifyEmail?: string
  maxDownloads?: number
  encrypted?: boolean
  onProgress?: (percent: number, speed: string, eta: string) => void
  onScanProgress?: (percent: number, currentFile: string | null, phase: 'streaming' | 'analyzing') => void
}

export class VirusFoundError extends Error {
  virus: string
  infectedFile?: string
  constructor(virus: string, infectedFile?: string) {
    super(virus)
    this.name = 'VirusFoundError'
    this.virus = virus
    this.infectedFile = infectedFile
  }
}

export class ScanError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScanError'
  }
}

interface ScanStatusResponse {
  status: 'scanning' | 'clean' | 'infected' | 'error'
  scannedBytes: number
  totalBytes: number
  currentFile: string | null
  phase?: 'streaming' | 'analyzing'
  virus?: string
  infectedFile?: string
  message?: string
  result?: TransferUploadResult
}

// Polls the scan-status endpoint until the server reports a final outcome.
async function pollScan(
  scanId: string,
  onProgress?: (percent: number, currentFile: string | null, phase: 'streaming' | 'analyzing') => void,
): Promise<TransferUploadResult> {
  for (;;) {
    const res = await api.get<ScanStatusResponse>(`/scan/${scanId}`)
    const data = res.data

    if (data.status === 'scanning') {
      const pct = data.totalBytes > 0
        ? Math.min(99, Math.round((data.scannedBytes / data.totalBytes) * 100))
        : 0
      onProgress?.(pct, data.currentFile, data.phase || 'streaming')
      await new Promise((r) => setTimeout(r, 700))
      continue
    }

    if (data.status === 'clean' && data.result) {
      onProgress?.(100, null, 'streaming')
      return data.result
    }

    if (data.status === 'infected') {
      throw new VirusFoundError(data.virus || 'Unbekannte Bedrohung', data.infectedFile)
    }

    throw new ScanError(data.message || 'Virenscan fehlgeschlagen')
  }
}

// ─── Chunked upload ───────────────────────────────────────────────────────────
// Files are split into CHUNK_SIZE slices and uploaded in parallel.
// When encrypted=true, each chunk is AES-256-GCM encrypted before sending.
// The key is returned in the result for embedding in the share URL fragment.

const CONCURRENCY = 6  // sliding-window slots

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
  while (pending.size > 0) await Promise.race(pending)
}

export async function uploadTransfer(
  files: File[],
  options: UploadOptions,
): Promise<TransferUploadResult> {
  const startTime   = Date.now()
  const totalBytes  = files.reduce((s, f) => s + f.size, 0)
  let uploadedBytes = 0

  const tick = (bytes: number) => {
    uploadedBytes += bytes
    if (!options.onProgress || totalBytes === 0) return
    const pct     = Math.min(99, Math.round((uploadedBytes / totalBytes) * 100))
    const elapsed = (Date.now() - startTime) / 1000 || 0.001
    const speed   = uploadedBytes / elapsed
    const remSec  = speed > 0 ? Math.round((totalBytes - uploadedBytes) / speed) : 0
    options.onProgress(pct, formatBytes(speed) + '/s', remSec + 's')
  }

  // Generate encryption key if E2E is requested
  let encKey: CryptoKey | undefined
  let encKeyExported: string | undefined
  if (options.encrypted) {
    encKey = await generateKey()
    encKeyExported = await exportKey(encKey)
  }

  // ── 1. Init ──────────────────────────────────────────────────────────────────
  const initRes = await api.post('/transfers/chunked/init', {
    title:         options.title        || undefined,
    message:       options.message      || undefined,
    password:      options.password     || undefined,
    expiresInDays: options.expiresInDays,
    notifyEmail:   options.notifyEmail  || undefined,
    maxDownloads:  options.maxDownloads || undefined,
    encrypted:     !!options.encrypted,
    files: files.map((f) => ({
      name:         f.name,
      relativePath: (f as any).webkitRelativePath || undefined,
      size:         f.size,
      mimeType:     f.type || 'application/octet-stream',
    })),
  })

  const { shortId, fileTokens } = initRes.data as { shortId: string; fileTokens: string[] }

  // ── 2. Stream chunks with sliding-window concurrency ─────────────────────────
  try {
    for (let fi = 0; fi < files.length; fi++) {
      const file      = files[fi]
      const fileToken = fileTokens[fi]
      const numChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE))

      await withConcurrency(numChunks, async (idx) => {
        const start = idx * CHUNK_SIZE
        const end   = Math.min(start + CHUNK_SIZE, file.size)

        let body: Blob | Uint8Array
        if (encKey) {
          // Read slice into memory, encrypt, send encrypted bytes
          const buf = await file.slice(start, end).arrayBuffer()
          body = await encryptChunk(encKey, new Uint8Array(buf))
        } else {
          // Stream Blob directly — zero-copy
          body = file.slice(start, end)
        }

        await api.put(`/transfers/chunked/${shortId}/part`, body, {
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

  // ── 3. Finalize ───────────────────────────────────────────────────────────────
  const finalRes = await api.post(`/transfers/chunked/${shortId}/finalize`)

  if (finalRes.status === 202) {
    const { scanId } = finalRes.data as { scanId: string }
    const result = await pollScan(scanId, options.onScanProgress)
    return { ...result, encryptionKey: encKeyExported }
  }

  options.onProgress?.(100, '—', '0s')
  return { ...finalRes.data, encryptionKey: encKeyExported }
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

export async function updateTransfer(
  shortId: string,
  data: { expiresAt?: string; maxDownloads?: number | null },
): Promise<Transfer> {
  const res = await api.patch(`/transfers/${shortId}`, data)
  return res.data
}

export async function resendTransferLink(shortId: string, email: string): Promise<void> {
  await api.post(`/transfers/${shortId}/resend`, { email })
}

export async function getTransferDownloads(shortId: string): Promise<{ downloads: DownloadLogEntry[] }> {
  const res = await api.get(`/transfers/${shortId}/downloads`)
  return res.data
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
