export interface User {
  id: string
  email: string
  username: string
  role: 'USER' | 'ADMIN'
  storageUsed: string
  createdAt: string
}

export interface FileInfo {
  id: string
  name: string
  size: string
  mimeType: string
}

export interface Transfer {
  shortId: string
  title?: string | null
  message?: string | null
  expiresAt: string
  createdAt: string
  downloadCount: number
  maxDownloads?: number | null
  totalSize: string
  passwordProtected: boolean
  encrypted: boolean
  files: FileInfo[]
  expired?: boolean
}

export interface TransferUploadResult {
  shortId: string
  expiresAt: string
  fileCount: number
  totalSize: string
  encryptionKey?: string  // base64url AES-256-GCM key, present when encrypted=true
}

export interface AdminStats {
  totalUsers: number
  activeTransfers: number
  expiredTransfers: number
  downloadsToday: number
  storageUsedBytes: string
  downloadHistory: { date: string; count: number }[]
  recentTransfers: AdminTransferRow[]
}

export interface AdminTransferRow {
  shortId: string
  title?: string | null
  createdAt: string
  expiresAt: string
  totalSize: string
  downloadCount: number
  fileCount: number
  passwordProtected: boolean
  uploaderUsername?: string | null
  uploaderEmail?: string | null
  expired: boolean
}

export interface AdminUser {
  id: string
  email: string
  username: string
  role: 'USER' | 'ADMIN'
  storageUsed: string
  createdAt: string
  transferCount: number
}

export interface PublicSettings {
  appName: string
  appDescription: string
  primaryColor: string
  logoUrl: string
  faviconUrl: string
  registrationEnabled: boolean
  maxFileSizeBytes: number
  maxTransferSizeBytes: number
  userStorageQuotaBytes: number
}

export interface AllSettings {
  [key: string]: string
}
