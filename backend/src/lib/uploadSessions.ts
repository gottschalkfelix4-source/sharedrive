import { PersistentMap } from './jobs'

export interface UploadPart {
  part: number
  etag: string
  bytes: number
}
export interface FileSession {
  uploadId: string
  storageKey: string
  filename: string
  fileIndex: number
  relativePath?: string
  mimeType: string
  declaredSize: number
  parts: UploadPart[]
  completed?: boolean
}
export interface TransferSession {
  shortId: string
  userId: string | null
  files: Record<string, FileSession>
  meta: {
    title?: string
    message?: string
    passwordHash: string | null
    expiresAt: string
    notifyEmail?: string
    maxDownloads?: number | null
  }
  maxTransferSizeBytes: number
  totalSize: number
  encrypted: boolean
  encryptionVersion: number
  encryptedManifest?: string
  encryptionContext?: string
  state: 'uploading' | 'finalizing' | 'published'
  result?: {
    status: number
    body:
      | {
          shortId: string
          expiresAt: string
          fileCount: number
          totalSize: string
          virusScanned: boolean
        }
      | { scanId: string }
  }
  createdAt: string
}
export const uploadSessions = new PersistentMap<TransferSession>('upload')
