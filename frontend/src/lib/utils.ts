export function formatBytes(bytes: number | string): string {
  const n = typeof bytes === 'string' ? parseInt(bytes) : bytes
  if (isNaN(n)) return '0 B'
  if (n >= 1e12) return (n / 1e12).toFixed(2) + ' TB'
  if (n >= 1e9) return (n / 1e9).toFixed(2) + ' GB'
  if (n >= 1e6) return (n / 1e6).toFixed(2) + ' MB'
  if (n >= 1e3) return (n / 1e3).toFixed(2) + ' KB'
  return n + ' B'
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

export function formatRelative(date: string | Date): string {
  const d = new Date(date)
  const now = new Date()
  const diff = d.getTime() - now.getTime()
  const absDiff = Math.abs(diff)
  const past = diff < 0

  if (absDiff < 60000) return past ? 'just now' : 'in a moment'
  if (absDiff < 3600000) {
    const m = Math.round(absDiff / 60000)
    return past ? `${m}m ago` : `in ${m}m`
  }
  if (absDiff < 86400000) {
    const h = Math.round(absDiff / 3600000)
    return past ? `${h}h ago` : `in ${h}h`
  }
  const days = Math.round(absDiff / 86400000)
  return past ? `${days}d ago` : `in ${days}d`
}

export function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return '🖼️'
  if (mimeType.startsWith('video/')) return '🎬'
  if (mimeType.startsWith('audio/')) return '🎵'
  if (mimeType.includes('pdf')) return '📄'
  if (mimeType.includes('zip') || mimeType.includes('archive') || mimeType.includes('compressed')) return '🗜️'
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝'
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊'
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📈'
  if (mimeType.includes('text')) return '📃'
  return '📎'
}

export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

export const PASSWORD_HINT = 'Mind. 8 Zeichen, ein Großbuchstabe, eine Zahl, ein Sonderzeichen'

// Mirrors the backend's passwordSchema (backend/src/lib/validation.ts) so users
// get the same feedback before submitting instead of round-tripping to the server.
export function getPasswordError(password: string): string | null {
  if (password.length < 8) return 'Mindestens 8 Zeichen'
  if (!/[A-Z]/.test(password)) return 'Mindestens ein Großbuchstabe'
  if (!/[0-9]/.test(password)) return 'Mindestens eine Zahl'
  if (!/[^A-Za-z0-9]/.test(password)) return 'Mindestens ein Sonderzeichen'
  return null
}

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text)
}
