export interface ScanFile {
  name: string
  size: number
  mimeType: string
  storageKey: string
}

export interface PendingTransfer {
  shortId: string
  userId: string | null
  title?: string
  message?: string
  passwordHash: string | null
  expiresAt: Date
  notifyEmail?: string
  totalSize: number
  files: ScanFile[]
}

export type ScanStatus = 'scanning' | 'clean' | 'infected' | 'error'

export interface ScanResultPayload {
  shortId: string
  expiresAt: Date
  fileCount: number
  totalSize: string
  virusScanned: boolean
}

export interface ScanSession {
  scanId: string
  pending: PendingTransfer
  scannedBytes: number
  currentFile: string | null
  status: ScanStatus
  virus?: string
  infectedFile?: string
  errorMessage?: string
  result?: ScanResultPayload
  createdAt: Date
}

export const scanSessions = new Map<string, ScanSession>()

// Clean up sessions older than 2 hours every 30 min
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000
  for (const [key, session] of scanSessions) {
    if (session.createdAt.getTime() < cutoff) scanSessions.delete(key)
  }
}, 30 * 60 * 1000).unref()
