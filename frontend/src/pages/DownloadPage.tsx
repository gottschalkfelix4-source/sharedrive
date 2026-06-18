import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Download, Lock, FileIcon, Archive, Clock, AlertCircle } from 'lucide-react'
import { getTransfer, getDownloadUrl, getZipUrl } from '@/api/transfers'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { formatBytes, formatDate, formatRelative, getFileIcon } from '@/lib/utils'

export function DownloadPage() {
  const { shortId } = useParams<{ shortId: string }>()
  const [password, setPassword] = useState('')
  const [enteredPassword, setEnteredPassword] = useState<string | undefined>()
  const [passwordError, setPasswordError] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['transfer', shortId, enteredPassword],
    queryFn: () => getTransfer(shortId!, enteredPassword),
    enabled: !!shortId,
    retry: false,
  })

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError('')
    setEnteredPassword(password)
  }

  const handleDownloadFile = (fileId: string) => {
    const url = getDownloadUrl(shortId!, fileId)
    const a = document.createElement('a')
    a.href = enteredPassword
      ? `${url}?p=${encodeURIComponent(enteredPassword)}`
      : url
    // Use header approach via fetch for password-protected files
    window.open(url, '_blank')
  }

  const handleDownloadAll = () => {
    window.open(getZipUrl(shortId!), '_blank')
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error) {
    const errMsg = (error as any)?.response?.data?.error || 'Transfer nicht gefunden'
    const isPasswordRequired = (error as any)?.response?.status === 401

    if (isPasswordRequired && !enteredPassword) {
      return (
        <div className="min-h-screen flex items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-sm bg-bg-card border border-border rounded-2xl p-8 text-center"
          >
            <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-4">
              <Lock size={28} className="text-amber-400" />
            </div>
            <h2 className="text-xl font-bold text-text-primary mb-2">Passwortgeschützt</h2>
            <p className="text-text-muted text-sm mb-6">Passwort eingeben, um auf diesen Transfer zuzugreifen</p>
            <form onSubmit={handlePasswordSubmit} className="space-y-3">
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={passwordError}
                icon={<Lock size={15} />}
              />
              <Button type="submit" className="w-full" size="lg">
                Transfer entsperren
              </Button>
            </form>
          </motion.div>
        </div>
      )
    }

    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-sm"
        >
          <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={28} className="text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-text-primary mb-2">Transfer nicht verfügbar</h2>
          <p className="text-text-muted text-sm">{errMsg}</p>
        </motion.div>
      </div>
    )
  }

  const transfer = data
  const isExpired = new Date(transfer.expiresAt) < new Date()

  return (
    <div className="min-h-screen">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-gradient-radial from-primary/10 to-transparent rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-xl mx-auto px-4 pt-12 pb-16">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-primary flex items-center justify-center mx-auto mb-4">
              <Download size={28} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-text-primary">
              {transfer.title || 'Geteilter Transfer'}
            </h1>
            {transfer.message && (
              <p className="text-text-muted text-sm mt-2 italic">"{transfer.message}"</p>
            )}
            <div className="flex items-center justify-center gap-3 mt-3 flex-wrap">
              <Badge variant={isExpired ? 'danger' : 'success'}>
                <Clock size={11} className="mr-1" />
                {isExpired ? 'Abgelaufen' : `Läuft ab ${formatRelative(transfer.expiresAt)}`}
              </Badge>
              <Badge>{formatBytes(transfer.totalSize)}</Badge>
              <Badge>{transfer.files.length} Datei{transfer.files.length > 1 ? 'en' : ''}</Badge>
              {transfer.downloadCount > 0 && (
                <Badge variant="info">{transfer.downloadCount} Downloads</Badge>
              )}
            </div>
          </div>

          {/* Files */}
          <div className="bg-bg-card border border-border rounded-2xl overflow-hidden mb-4">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <span className="text-sm font-medium text-text-secondary">Dateien</span>
              {transfer.files.length > 1 && !isExpired && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Archive size={14} />}
                  onClick={handleDownloadAll}
                >
                  Alle herunterladen
                </Button>
              )}
            </div>

            <div className="divide-y divide-border">
              {transfer.files.map((file: any, i: number) => (
                <motion.div
                  key={file.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <span className="text-2xl">{getFileIcon(file.mimeType)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{file.name}</p>
                    <p className="text-xs text-text-muted">{formatBytes(file.size)}</p>
                  </div>
                  {!isExpired && (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Download size={13} />}
                      onClick={() => handleDownloadFile(file.id)}
                    >
                      Herunterladen
                    </Button>
                  )}
                </motion.div>
              ))}
            </div>
          </div>

          {!isExpired && (
            <Button
              className="w-full"
              size="lg"
              icon={<Download size={18} />}
              onClick={transfer.files.length === 1 ? () => handleDownloadFile(transfer.files[0].id) : handleDownloadAll}
            >
              {transfer.files.length === 1 ? 'Datei herunterladen' : 'Alle als ZIP herunterladen'}
            </Button>
          )}

          <p className="text-center text-xs text-text-muted mt-4">
            Läuft ab am {formatDate(transfer.expiresAt)}
          </p>
        </motion.div>
      </div>
    </div>
  )
}
