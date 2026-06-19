export interface UploadPart {
  part: number
  etag: string
}

export interface FileSession {
  uploadId: string
  storageKey: string
  filename: string
  relativePath?: string
  mimeType: string
  declaredSize: number
  parts: UploadPart[]
}

export interface TransferSession {
  shortId: string
  userId: string | null
  files: Map<string, FileSession>   // fileToken → FileSession
  meta: {
    title?: string
    message?: string
    passwordHash: string | null
    expiresAt: Date
    notifyEmail?: string
    maxDownloads?: number | null
  }
  maxTransferSizeBytes: number
  encrypted: boolean
  createdAt: Date
}

export const uploadSessions = new Map<string, TransferSession>()

// Clean up sessions older than 2 hours every 30 min
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000
  for (const [key, session] of uploadSessions) {
    if (session.createdAt.getTime() < cutoff) uploadSessions.delete(key)
  }
}, 30 * 60 * 1000).unref()
