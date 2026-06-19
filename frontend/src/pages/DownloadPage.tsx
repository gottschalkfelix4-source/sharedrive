import { useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Download, Lock, FileIcon, Archive, Clock, AlertCircle, ShieldCheck, ShieldOff } from 'lucide-react'
import { getTransfer, getDownloadUrl, getZipUrl } from '@/api/transfers'
import { importKey, decryptToBlob, decryptStream } from '@/lib/e2e'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { formatBytes, formatDate, formatRelative, getFileIcon } from '@/lib/utils'
import toast from 'react-hot-toast'

type DlProgress = { phase: 'download' | 'decrypt'; pct: number; speed: number }

async function readWithProgress(
  response: Response,
  plaintextSize: number,
  onProgress: (pct: number, speed: number) => void,
): Promise<ArrayBuffer> {
  const contentLen = parseInt(response.headers.get('content-length') || String(plaintextSize))
  const reader = response.body!.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  let lastT = Date.now()
  let lastB = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    const now = Date.now()
    const elapsed = (now - lastT) / 1000
    if (elapsed >= 0.25) {
      onProgress(Math.min(99, Math.round((received / contentLen) * 100)), (received - lastB) / elapsed)
      lastT = now
      lastB = received
    }
  }
  onProgress(100, 0)

  const buf = new Uint8Array(received)
  let off = 0
  for (const c of chunks) { buf.set(c, off); off += c.length }
  return buf.buffer as ArrayBuffer
}

// Parse #key=<base64url> from the URL fragment (never sent to the server)
function useEncryptionKey(): string | null {
  return useMemo(() => {
    const hash = window.location.hash.slice(1)
    return new URLSearchParams(hash).get('key')
  }, [])
}

const hasFilePicker = typeof (window as any).showSaveFilePicker === 'function'

export function DownloadPage() {
  const { shortId } = useParams<{ shortId: string }>()
  const [password, setPassword] = useState('')
  const [enteredPassword, setEnteredPassword] = useState<string | undefined>()
  const [passwordError, setPasswordError] = useState('')
  const [decrypting, setDecrypting] = useState<string | null>(null)  // fileId being decrypted
  const [dlProgress, setDlProgress] = useState<DlProgress | null>(null)
  const [dlQueue, setDlQueue] = useState<{ current: number; total: number } | null>(null)

  const encKeyRaw = useEncryptionKey()

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

  const handleDownloadFile = async (fileId: string, fileName: string, fileSize: string) => {
    const url = getDownloadUrl(shortId!, fileId)
    const transfer = data

    // Encrypted transfer with key available — decrypt in browser
    if (transfer?.encrypted && encKeyRaw) {
      setDecrypting(fileId)
      setDlProgress({ phase: 'download', pct: 0, speed: 0 })
      try {
        const key = await importKey(encKeyRaw)
        const fetchHeaders: Record<string, string> = { 'Accept': 'application/octet-stream' }
        if (enteredPassword) fetchHeaders['x-transfer-password'] = enteredPassword

        if (hasFilePicker) {
          // Streaming decrypt via File System Access API — download + decrypt interleaved
          const fileHandle = await (window as any).showSaveFilePicker({ suggestedName: fileName })
          const writable = await fileHandle.createWritable()
          const response = await fetch(url, { headers: fetchHeaders })
          if (!response.ok) throw new Error('Download fehlgeschlagen')
          setDlProgress({ phase: 'decrypt', pct: 0, speed: 0 })
          await decryptStream(response.body!, key, parseInt(fileSize), writable, (pct) => {
            setDlProgress({ phase: 'decrypt', pct, speed: 0 })
          })
        } else {
          // In-memory decrypt — phase 1: download, phase 2: decrypt
          const response = await fetch(url, { headers: fetchHeaders })
          if (!response.ok) throw new Error('Download fehlgeschlagen')
          const encData = await readWithProgress(response, parseInt(fileSize), (pct, speed) => {
            setDlProgress({ phase: 'download', pct, speed })
          })
          setDlProgress({ phase: 'decrypt', pct: 0, speed: 0 })
          const blob = await decryptToBlob(key, encData, parseInt(fileSize), (pct) => {
            setDlProgress({ phase: 'decrypt', pct, speed: 0 })
          })
          const a = document.createElement('a')
          a.href = URL.createObjectURL(blob)
          a.download = fileName
          a.click()
          setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
        }
      } catch (err: any) {
        console.error(err)
        toast.error(err?.message || 'Entschlüsselung fehlgeschlagen')
      } finally {
        setDecrypting(null)
        setDlProgress(null)
      }
      return
    }

    // Regular (unencrypted) download
    window.open(url, '_blank')
  }

  const handleDownloadAll = () => {
    window.open(getZipUrl(shortId!), '_blank')
  }

  const handleDownloadAllEncrypted = async () => {
    const files = data?.files ?? []
    for (let i = 0; i < files.length; i++) {
      setDlQueue({ current: i + 1, total: files.length })
      await handleDownloadFile(files[i].id, files[i].name, files[i].size)
    }
    setDlQueue(null)
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
                placeholder="Passwort"
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
  const isEncrypted = transfer.encrypted
  const canDecrypt = isEncrypted && !!encKeyRaw
  const keyMissing = isEncrypted && !encKeyRaw

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
              {canDecrypt && (
                <Badge variant="info" className="gap-1">
                  <ShieldCheck size={11} />
                  E2E verschlüsselt
                </Badge>
              )}
              {transfer.virusScanned && (
                <Badge variant="success" className="gap-1">
                  <ShieldCheck size={11} />
                  Virenfrei
                </Badge>
              )}
            </div>
          </div>

          {/* Missing key warning */}
          {keyMissing && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300"
            >
              <ShieldOff size={16} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Entschlüsselungsschlüssel fehlt</p>
                <p className="text-amber-400/80 mt-0.5 text-xs">
                  Dieser Transfer ist Ende-zu-Ende verschlüsselt. Der Schlüssel muss im vollständigen Link enthalten sein (#key=…). Frage den Absender nach dem kompletten Link.
                </p>
              </div>
            </motion.div>
          )}

          {/* Files */}
          <div className="bg-bg-card border border-border rounded-2xl overflow-hidden mb-4">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <span className="text-sm font-medium text-text-secondary">Dateien</span>
              {transfer.files.length > 1 && !isExpired && !isEncrypted && (
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
                    <p className="text-sm font-medium text-text-primary truncate">{file.relativePath || file.name}</p>
                    <p className="text-xs text-text-muted">{formatBytes(file.size)}</p>
                  </div>
                  {!isExpired && !keyMissing && (
                    decrypting === file.id ? (
                      <div className="flex flex-col items-end gap-1 w-36">
                        <div className="flex items-center justify-between w-full text-xs">
                          <span className="text-text-muted">
                            {dlProgress?.phase === 'download' ? 'Herunterladen' : 'Entschlüsseln'}…
                          </span>
                          <span className="font-semibold text-text-primary">{dlProgress?.pct ?? 0}%</span>
                        </div>
                        {dlProgress?.phase === 'download' && dlProgress.speed > 0 && (
                          <p className="text-[10px] text-text-muted self-end leading-none">
                            {formatBytes(Math.round(dlProgress.speed))}/s
                          </p>
                        )}
                        <div className="w-full h-1 bg-border rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-[width] duration-150 ease-out"
                            style={{ width: `${dlProgress?.pct ?? 0}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Download size={13} />}
                        disabled={decrypting !== null}
                        onClick={() => handleDownloadFile(file.id, file.name, file.size)}
                      >
                        Herunterladen
                      </Button>
                    )
                  )}
                </motion.div>
              ))}
            </div>
          </div>

          {!isExpired && !keyMissing && (
            <div className="space-y-2">
              <Button
                className="w-full"
                size="lg"
                icon={decrypting ? undefined : <Download size={18} />}
                disabled={decrypting !== null}
                onClick={
                  transfer.files.length === 1
                    ? () => handleDownloadFile(transfer.files[0].id, transfer.files[0].name, transfer.files[0].size)
                    : isEncrypted
                    ? handleDownloadAllEncrypted
                    : handleDownloadAll
                }
              >
                {decrypting
                  ? `${dlQueue ? `${dlQueue.current}/${dlQueue.total} – ` : ''}${dlProgress?.phase === 'download' ? 'Herunterladen' : 'Entschlüsseln'}… ${dlProgress?.pct ?? 0}%`
                  : transfer.files.length === 1
                  ? (isEncrypted ? 'Entschlüsseln & herunterladen' : 'Datei herunterladen')
                  : isEncrypted
                  ? 'Alle entschlüsseln & herunterladen'
                  : 'Alle als ZIP herunterladen'}
              </Button>

              {decrypting && (
                <div className="space-y-1">
                  <div className="h-1.5 bg-border rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-[width] duration-150 ease-out"
                      style={{ width: `${dlProgress?.pct ?? 0}%` }}
                    />
                  </div>
                  {dlProgress?.phase === 'download' && dlProgress.speed > 0 && (
                    <p className="text-center text-xs text-text-muted">
                      {formatBytes(Math.round(dlProgress.speed))}/s
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {canDecrypt && !hasFilePicker && (
            <p className="text-center text-xs text-text-muted mt-3">
              Tipp: Chrome/Edge unterstützt direktes Speichern großer Dateien. Bei Firefox/Safari wird die Datei zuerst vollständig im Arbeitsspeicher entschlüsselt.
            </p>
          )}

          <p className="text-center text-xs text-text-muted mt-4">
            Läuft ab am {formatDate(transfer.expiresAt)}
          </p>
        </motion.div>
      </div>
    </div>
  )
}
