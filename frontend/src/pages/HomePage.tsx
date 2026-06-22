import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield, Zap, Globe, ArrowRight, ShieldCheck, HardDrive, AlertCircle } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { UploadZone } from '@/components/upload/UploadZone'
import { UploadOptions } from '@/components/upload/UploadOptions'
import { UploadProgress } from '@/components/upload/UploadProgress'
import { VirusScanProgress, VirusScanResult } from '@/components/upload/VirusScanProgress'
import { SuccessScreen } from '@/components/upload/SuccessScreen'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { MatrixRain } from '@/components/effects/MatrixRain'
import { LockAnimation } from '@/components/effects/LockAnimation'
import { Toggle } from '@/components/ui/Toggle'
import { uploadTransfer, VirusFoundError, ScanError, type UploadOptions as UOpts } from '@/api/transfers'
import { getDiskStats } from '@/api/settings'
import toast from 'react-hot-toast'

type Phase = 'idle' | 'uploading' | 'scanning' | 'blocked' | 'success'

interface ScanErrorState {
  type: 'infected' | 'error'
  virus?: string
  infectedFile?: string
  message?: string
}

const defaultOptions = {
  title: '',
  message: '',
  password: '',
  expiresInDays: 7,
  notifyEmail: '',
  maxDownloads: '',
  encrypted: false,
}

const features = [
  { icon: <Zap size={20} />, title: 'Blitzschnell', desc: 'Direkt in sicheren Speicher gestreamt' },
  { icon: <Shield size={20} />, title: 'Sicher & privat', desc: 'Optionaler Passwortschutz' },
  { icon: <Globe size={20} />, title: 'Überall teilen', desc: 'Einfacher Link, kein Konto nötig' },
]

function formatTimeUntil(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return 'gleich'
  const totalMinutes = Math.floor(diff / 60_000)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  if (days > 0 && hours > 0) return `in ${days} Tag${days > 1 ? 'en' : ''} und ${hours} Stunde${hours > 1 ? 'n' : ''}`
  if (days > 0) return `in ${days} Tag${days > 1 ? 'en' : ''}`
  if (hours > 0 && minutes > 0) return `in ${hours} Stunde${hours > 1 ? 'n' : ''} und ${minutes} Minute${minutes > 1 ? 'n' : ''}`
  if (hours > 0) return `in ${hours} Stunde${hours > 1 ? 'n' : ''}`
  return `in ${minutes} Minute${minutes !== 1 ? 'n' : ''}`
}

export function HomePage() {
  const { data: diskStats } = useQuery({
    queryKey: ['disk-stats'],
    queryFn: getDiskStats,
    staleTime: 30_000,
  })

  const diskFull = (diskStats?.pct ?? 0) >= 95

  const [files, setFiles] = useState<File[]>([])
  const [options, setOptions] = useState(defaultOptions)
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState({ percent: 0, speed: '0 KB/s', eta: '…' })
  const [scanProgress, setScanProgress] = useState({ percent: 0, currentFile: null as string | null, phase: 'streaming' as 'streaming' | 'analyzing' })
  const [scanError, setScanError] = useState<ScanErrorState | null>(null)
  const [result, setResult] = useState<any>(null)
  const [showLockAnim, setShowLockAnim] = useState(false)

  const handleFilesAdded = (newFiles: File[]) => {
    setFiles((prev) => [...prev, ...newFiles])
  }

  const handleRemove = (i: number) => {
    setFiles((prev) => prev.filter((_, idx) => idx !== i))
  }

  const handleOptionChange = (key: string, value: string | number | boolean) => {
    if (key === 'encrypted' && value === true) setShowLockAnim(true)
    setOptions((prev) => ({ ...prev, [key]: value }))
  }

  const handleUpload = async () => {
    if (files.length === 0) {
      toast.error('Mindestens eine Datei hinzufügen')
      return
    }
    setPhase('uploading')
    try {
      const res = await uploadTransfer(files, {
        ...options,
        maxDownloads: options.maxDownloads ? parseInt(options.maxDownloads) : undefined,
        onProgress: (percent, speed, eta) => setProgress({ percent, speed, eta }),
        onScanProgress: (percent, currentFile, scanPhase) => {
          setPhase('scanning')
          setScanProgress({ percent, currentFile, phase: scanPhase })
        },
      })
      setResult(res)
      setPhase('success')
    } catch (err: any) {
      if (err instanceof VirusFoundError) {
        setScanError({ type: 'infected', virus: err.virus, infectedFile: err.infectedFile })
        setPhase('blocked')
      } else if (err instanceof ScanError) {
        setScanError({ type: 'error', message: err.message })
        setPhase('blocked')
      } else {
        toast.error(err?.response?.data?.error || 'Upload fehlgeschlagen')
        setPhase('idle')
      }
    }
  }

  const handleReset = () => {
    setFiles([])
    setOptions(defaultOptions)
    setPhase('idle')
    setResult(null)
    setScanProgress({ percent: 0, currentFile: null, phase: 'streaming' })
    setScanError(null)
  }

  const totalSize = files.reduce((sum, f) => sum + f.size, 0)

  return (
    <div className="min-h-screen">
      <MatrixRain />

      {/* Hero gradient */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-radial from-primary/15 to-transparent rounded-full blur-3xl" />
        <div className="absolute top-32 right-20 w-[300px] h-[300px] bg-violet-500/8 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-2xl mx-auto px-4 pt-16 pb-24">
        {/* Hero text */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <h1 className="text-4xl sm:text-5xl font-extrabold text-text-primary tracking-tight">
            Dateien teilen,{' '}
            <span className="bg-gradient-primary bg-clip-text text-transparent">
              mühelos
            </span>
          </h1>
          <p className="text-text-muted mt-4 text-lg">
            Dateien ablegen und in Sekunden einen teilbaren Link erhalten. Kein Konto erforderlich.
          </p>
        </motion.div>

        {/* Main upload card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="relative bg-bg-card border border-border rounded-2xl p-6 shadow-card overflow-hidden"
        >
          <LockAnimation show={showLockAnim} onComplete={() => setShowLockAnim(false)} />
          <AnimatePresence mode="wait">
            {phase === 'idle' && (
              <motion.div
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                {diskFull && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
                  >
                    <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">Kein Speicherplatz verfügbar</p>
                      <p className="text-red-400/80 mt-0.5 text-xs">
                        {diskStats?.nextExpiryAt
                          ? `Uploads sind derzeit nicht möglich. Nächste Dateien werden ${formatTimeUntil(diskStats.nextExpiryAt)} automatisch gelöscht und geben Speicher frei.`
                          : 'Uploads sind derzeit nicht möglich. Bitte wende dich an den Administrator.'}
                      </p>
                    </div>
                  </motion.div>
                )}

                <UploadZone
                  files={files}
                  onFilesAdded={handleFilesAdded}
                  onFileRemove={handleRemove}
                />

                {files.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    {/* E2E encryption toggle — between file list and transfer options */}
                    <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl border border-border bg-bg-elevated">
                      <div>
                        <p className="text-sm font-medium text-text-primary flex items-center gap-1.5">
                          <ShieldCheck size={14} className="text-violet-400" />
                          Ende-zu-Ende-Verschlüsselung
                        </p>
                        <p className="text-xs text-text-muted mt-0.5">AES-256-GCM — Schlüssel nur im Link, nie auf dem Server</p>
                      </div>
                      <Toggle
                        checked={options.encrypted}
                        onChange={(v) => handleOptionChange('encrypted', v)}
                      />
                    </div>

                    <UploadOptions options={options} onChange={handleOptionChange} />

                    <Button
                      className="w-full"
                      size="lg"
                      icon={<ArrowRight size={18} />}
                      disabled={diskFull}
                      onClick={handleUpload}
                    >
                      Hochladen & Link erhalten
                    </Button>
                  </motion.div>
                )}
              </motion.div>
            )}

            {phase === 'uploading' && (
              <motion.div key="uploading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <UploadProgress
                  percent={progress.percent}
                  speed={progress.speed}
                  eta={progress.eta}
                  fileCount={files.length}
                />
              </motion.div>
            )}

            {phase === 'scanning' && (
              <motion.div key="scanning" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <VirusScanProgress
                  percent={scanProgress.percent}
                  currentFile={scanProgress.currentFile}
                  fileCount={files.length}
                  phase={scanProgress.phase}
                />
              </motion.div>
            )}

            {phase === 'blocked' && scanError && (
              <motion.div key="blocked" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <VirusScanResult
                  type={scanError.type}
                  virus={scanError.virus}
                  infectedFile={scanError.infectedFile}
                  message={scanError.message}
                  onReset={handleReset}
                />
              </motion.div>
            )}

            {phase === 'success' && result && (
              <motion.div key="success" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <SuccessScreen
                  shortId={result.shortId}
                  expiresAt={result.expiresAt}
                  fileCount={result.fileCount}
                  totalSize={result.totalSize}
                  encryptionKey={result.encryptionKey}
                  virusScanned={result.virusScanned}
                  onReset={handleReset}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Feature cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-3 gap-3 mt-6"
        >
          {features.map((f, i) => (
            <Card key={i} className="p-4 text-center">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
                {f.icon}
              </div>
              <p className="text-sm font-semibold text-text-primary">{f.title}</p>
              <p className="text-xs text-text-muted mt-1">{f.desc}</p>
            </Card>
          ))}
        </motion.div>

        {/* Server disk usage */}
        {diskStats && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mt-4 flex items-center gap-3 px-1"
          >
            <HardDrive size={13} className="text-text-muted flex-shrink-0" />
            <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${
                  diskStats.pct >= 90 ? 'bg-red-500' : diskStats.pct >= 70 ? 'bg-amber-500' : 'bg-primary'
                }`}
                style={{ width: `${diskStats.pct}%` }}
              />
            </div>
            <span className="text-xs text-text-muted tabular-nums">{diskStats.pct}%</span>
          </motion.div>
        )}
      </div>
    </div>
  )
}
