import { api } from './client'
import type { Transfer, TransferUploadResult, DownloadLogEntry } from '../types'
import {
  generateKey,
  exportKey,
  encryptChunk,
  encryptText,
  CHUNK_SIZE,
  metadataAAD,
  encryptionManifest,
} from '@/lib/e2e'

export interface UploadOptions {
  title?: string
  message?: string
  password?: string
  expiresInDays?: number
  notifyEmail?: string
  maxDownloads?: number
  encrypted?: boolean
  signal?: AbortSignal
  onProgress?: (percent: number, speed: string, eta: string) => void
  onScanProgress?: (
    percent: number,
    currentFile: string | null,
    phase: 'streaming' | 'analyzing'
  ) => void
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

const settle = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// Polls the scan-status endpoint until the server reports a final outcome.
async function pollScan(
  scanId: string,
  onProgress?: (
    percent: number,
    currentFile: string | null,
    phase: 'streaming' | 'analyzing'
  ) => void,
  signal?: AbortSignal
): Promise<TransferUploadResult> {
  const deadline = Date.now() + 60 * 60_000
  for (;;) {
    signal?.throwIfAborted()
    if (Date.now() > deadline)
      throw new ScanError(
        'Virenscan dauert zu lange. Bitte später erneut prüfen.'
      )
    const res = await api.get<ScanStatusResponse>(`/scan/${scanId}`, { signal })
    const data = res.data

    if (data.status === 'scanning') {
      const pct =
        data.totalBytes > 0
          ? Math.min(
              99,
              Math.round((data.scannedBytes / data.totalBytes) * 100)
            )
          : 0
      onProgress?.(pct, data.currentFile, data.phase || 'streaming')
      await new Promise((r) => setTimeout(r, 400))
      continue
    }

    if (data.status === 'clean' && data.result) {
      onProgress?.(100, null, 'streaming')
      // Give the smoothed progress ring time to visually reach 100% before the
      // caller swaps phases away — otherwise the result screen appears mid-animation.
      await settle(650)
      return data.result
    }

    if (data.status === 'infected') {
      throw new VirusFoundError(
        data.virus || 'Unbekannte Bedrohung',
        data.infectedFile
      )
    }

    throw new ScanError(data.message || 'Virenscan fehlgeschlagen')
  }
}

// ─── Chunked upload ───────────────────────────────────────────────────────────
// Files are split into CHUNK_SIZE slices and uploaded in parallel.
// When encrypted=true, each chunk is AES-256-GCM encrypted before sending.
// The key is returned in the result for embedding in the share URL fragment.

const CONCURRENCY = 6 // sliding-window slots

async function withConcurrency(
  count: number,
  fn: (index: number) => Promise<void>,
  onError: () => void
): Promise<void> {
  let next = 0,
    failed = false
  const results = await Promise.allSettled(
    Array.from({ length: Math.min(CONCURRENCY, count) }, async () => {
      while (!failed && next < count) {
        const index = next++
        try {
          await fn(index)
        } catch (err) {
          failed = true
          onError()
          throw err
        }
      }
    })
  )
  const rejected = results.find((r) => r.status === 'rejected') as
    | PromiseRejectedResult
    | undefined
  if (rejected) throw rejected.reason
}

export async function uploadTransfer(
  files: File[],
  options: UploadOptions
): Promise<TransferUploadResult> {
  const controller = new AbortController()
  const abort = () => controller.abort(options.signal?.reason)
  options.signal?.addEventListener('abort', abort, { once: true })
  try {
    if (options.signal?.aborted) abort()
    const startTime = Date.now()
    const totalBytes = files.reduce((s, f) => s + f.size, 0)
    let uploadedBytes = 0

    const tick = (bytes: number) => {
      uploadedBytes += bytes
      if (!options.onProgress || totalBytes === 0) return
      const pct = Math.min(99, Math.round((uploadedBytes / totalBytes) * 100))
      const elapsed = (Date.now() - startTime) / 1000 || 0.001
      const speed = uploadedBytes / elapsed
      const remSec =
        speed > 0 ? Math.round((totalBytes - uploadedBytes) / speed) : 0
      options.onProgress(pct, formatBytes(speed) + '/s', formatEta(remSec))
    }

    // Generate encryption key if E2E is requested
    const encryptionContext = options.encrypted
      ? crypto.randomUUID()
      : undefined
    let encKey: CryptoKey | undefined
    let encKeyExported: string | undefined
    if (options.encrypted) {
      encKey = await generateKey()
      encKeyExported = await exportKey(encKey)
    }

    // When E2E is on, metadata (title/message/filenames/folder paths) is encrypted
    // too, so the server/DB never sees anything readable — only file size, count
    // and dates remain.
    const title = options.title || undefined
    const message = options.message || undefined
    const metaTitle =
      encKey && title
        ? await encryptText(
            encKey,
            title,
            metadataAAD(encryptionContext!, 'title')
          )
        : title
    const metaMessage =
      encKey && message
        ? await encryptText(
            encKey,
            message,
            metadataAAD(encryptionContext!, 'message')
          )
        : message
    const metaFiles = await Promise.all(
      files.map(async (f, index) => {
        const relativePath = (f as any).webkitRelativePath || undefined
        return {
          name: encKey
            ? await encryptText(
                encKey,
                f.name,
                metadataAAD(encryptionContext!, `name:${index}`)
              )
            : f.name,
          relativePath:
            encKey && relativePath
              ? await encryptText(
                  encKey,
                  relativePath,
                  metadataAAD(encryptionContext!, `path:${index}`)
                )
              : relativePath,
          size: f.size,
          mimeType: f.type || 'application/octet-stream',
        }
      })
    )

    const encryptedManifest = encKey
      ? await encryptText(
          encKey,
          encryptionManifest({
            title: title ?? null,
            message: message ?? null,
            files: files.map((f, index) => ({
              index,
              name: f.name,
              path: f.webkitRelativePath || null,
              size: f.size,
              mimeType: f.type || 'application/octet-stream',
            })),
          }),
          metadataAAD(encryptionContext!, 'manifest')
        )
      : undefined

    // ── 1. Init ──────────────────────────────────────────────────────────────────
    const initRes = await api.post(
      '/transfers/chunked/init',
      {
        title: metaTitle,
        message: metaMessage,
        password: options.password || undefined,
        expiresInDays: options.expiresInDays,
        notifyEmail: options.notifyEmail || undefined,
        maxDownloads: options.maxDownloads || undefined,
        encrypted: !!options.encrypted,
        encryptionVersion: options.encrypted ? 2 : 1,
        encryptionContext,
        encryptedManifest,
        files: metaFiles,
      },
      { signal: controller.signal }
    )

    const { shortId, fileTokens } = initRes.data as {
      shortId: string
      fileTokens: string[]
    }

    // ── 2. Stream chunks with sliding-window concurrency ─────────────────────────
    try {
      for (let fi = 0; fi < files.length; fi++) {
        const file = files[fi]
        const fileToken = fileTokens[fi]
        const numChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE))

        await withConcurrency(
          numChunks,
          async (idx) => {
            const start = idx * CHUNK_SIZE
            const end = Math.min(start + CHUNK_SIZE, file.size)

            let body: Blob | Uint8Array
            if (encKey) {
              // Read slice into memory, encrypt, send encrypted bytes
              const buf = await file.slice(start, end).arrayBuffer()
              body = await encryptChunk(
                encKey,
                new Uint8Array(buf),
                {
                  id: encryptionContext!,
                  fileIndex: fi,
                  plaintextSize: file.size,
                },
                idx
              )
            } else {
              // Stream Blob directly — zero-copy
              body = file.slice(start, end)
            }

            for (let attempt = 0; ; attempt++) {
              try {
                await api.put(`/transfers/chunked/${shortId}/part`, body, {
                  headers: {
                    'Content-Type': 'application/octet-stream',
                    'x-file-token': fileToken,
                    'x-part-number': String(idx + 1),
                  },
                  signal: controller.signal,
                  timeout: 120000,
                })
                break
              } catch (error) {
                const status = (error as { response?: { status: number } })
                  .response?.status
                if (
                  controller.signal.aborted ||
                  attempt >= 2 ||
                  (status !== undefined && status < 500)
                )
                  throw error
                await settle(500 * 2 ** attempt)
                controller.signal.throwIfAborted()
              }
            }

            tick(end - start)
          },
          () => controller.abort()
        )
      }
    } catch (err) {
      controller.abort()
      api
        .delete(`/transfers/chunked/${shortId}`, {
          headers: { 'x-file-token': fileTokens[0] },
        })
        .catch(() => {})
      options.signal?.removeEventListener('abort', abort)
      throw err
    }

    // ── 3. Finalize ───────────────────────────────────────────────────────────────
    const finalRes = await api
      .post(`/transfers/chunked/${shortId}/finalize`, undefined, {
        signal: controller.signal,
        headers: { 'x-file-token': fileTokens[0] },
      })
      .catch(async (err) => {
        await api
          .delete(`/transfers/chunked/${shortId}`, {
            headers: { 'x-file-token': fileTokens[0] },
          })
          .catch(() => {})
        throw err
      })
    options.onProgress?.(100, '—', '0s')
    // Let the smoothed upload ring visually reach 100% before switching phase.
    await settle(400)

    if (finalRes.status === 202) {
      const { scanId } = finalRes.data as { scanId: string }
      const result = await pollScan(
        scanId,
        options.onScanProgress,
        controller.signal
      )
      return {
        ...result,
        encryptionKey: encKeyExported,
        encryptionVersion: options.encrypted ? 2 : 1,
        encryptionContext,
      }
    }

    return {
      ...finalRes.data,
      encryptionKey: encKeyExported,
      encryptionVersion: options.encrypted ? 2 : 1,
      encryptionContext,
    }
  } finally {
    options.signal?.removeEventListener('abort', abort)
  }
}

export async function getTransfer(
  shortId: string,
  password?: string
): Promise<Transfer> {
  const headers: Record<string, string> = {}
  if (password) headers['x-transfer-password'] = password
  const res = await api.get(`/d/${shortId}`, { headers })
  return res.data
}

export async function getMyTransfers(
  page = 1
): Promise<{ transfers: Transfer[]; total: number; pages: number }> {
  const res = await api.get(`/transfers/mine?page=${page}`)
  return res.data
}

export async function deleteTransfer(shortId: string): Promise<void> {
  await api.delete(`/transfers/${shortId}`)
}

export async function updateTransfer(
  shortId: string,
  data: { expiresAt?: string; maxDownloads?: number | null }
): Promise<Transfer> {
  const res = await api.patch(`/transfers/${shortId}`, data)
  return res.data
}

export async function resendTransferLink(
  shortId: string,
  email: string
): Promise<void> {
  await api.post(`/transfers/${shortId}/resend`, { email })
}

export async function getTransferDownloads(
  shortId: string
): Promise<{ downloads: DownloadLogEntry[] }> {
  const res = await api.get(`/transfers/${shortId}/downloads`)
  return res.data
}

export function getDownloadUrl(shortId: string, fileId: string): string {
  return `/api/d/${shortId}/files/${fileId}`
}

export function getZipUrl(shortId: string): string {
  return `/api/d/${shortId}/zip`
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  return `${Math.round(seconds / 60)} min`
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB'
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB'
  if (bytes >= 1e3) return (bytes / 1e3).toFixed(1) + ' KB'
  return bytes + ' B'
}

export async function getTicketUrl(
  shortId: string,
  fileId: string | undefined,
  password: string | undefined
): Promise<string> {
  const res = await api.post(
    `/d/${shortId}/ticket`,
    { fileId },
    { headers: password ? { 'x-transfer-password': password } : {} }
  )
  const path = fileId ? getDownloadUrl(shortId, fileId) : getZipUrl(shortId)
  return `${path}?ticket=${encodeURIComponent(res.data.ticket)}`
}
