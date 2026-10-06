export interface ScanFile {
  name: string
  relativePath?: string
  size: number
  storedSize?: number
  encryptionIndex?: number
  mimeType: string
  storageKey: string
}

export interface PendingTransfer {
  shortId: string
  ip?: string
  userId: string | null
  title?: string
  message?: string
  passwordHash: string | null
  expiresAt: Date
  notifyEmail?: string
  maxDownloads?: number | null
  totalSize: number
  encrypted?: boolean
  encryptionVersion?: number
  encryptedManifest?: string
  encryptionContext?: string
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
  phase: 'streaming' | 'analyzing'
  status: ScanStatus
  virus?: string
  infectedFile?: string
  errorMessage?: string
  result?: ScanResultPayload
  createdAt: Date
}

import { PersistentMap } from './jobs'
export const scanSessions = new PersistentMap<ScanSession>('scan')
