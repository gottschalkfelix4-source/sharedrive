import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield, Zap, Globe, ArrowRight, ShieldCheck } from 'lucide-react'
import { UploadZone } from '@/components/upload/UploadZone'
import { UploadOptions } from '@/components/upload/UploadOptions'
import { UploadProgress } from '@/components/upload/UploadProgress'
import { SuccessScreen } from '@/components/upload/SuccessScreen'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { MatrixRain } from '@/components/effects/MatrixRain'
import { LockAnimation } from '@/components/effects/LockAnimation'
import { Toggle } from '@/components/ui/Toggle'
import { uploadTransfer, type UploadOptions as UOpts } from '@/api/transfers'
import toast from 'react-hot-toast'

type Phase = 'idle' | 'uploading' | 'success'

const defaultOptions = {
  title: '',
  message: '',
  password: '',
  expiresInDays: 7,
  notifyEmail: '',
  encrypted: false,
}

const features = [
  { icon: <Zap size={20} />, title: 'Blitzschnell', desc: 'Direkt in sicheren Speicher gestreamt' },
  { icon: <Shield size={20} />, title: 'Sicher & privat', desc: 'Optionaler Passwortschutz' },
  { icon: <Globe size={20} />, title: 'Überall teilen', desc: 'Einfacher Link, kein Konto nötig' },
]

export function HomePage() {
  const [files, setFiles] = useState<File[]>([])
  const [options, setOptions] = useState(defaultOptions)
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState({ percent: 0, speed: '0 KB/s', eta: '…' })
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
        onProgress: (percent, speed, eta) => setProgress({ percent, speed, eta }),
      })
      setResult(res)
      setPhase('success')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Upload fehlgeschlagen')
      setPhase('idle')
    }
  }

  const handleReset = () => {
    setFiles([])
    setOptions(defaultOptions)
    setPhase('idle')
    setResult(null)
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

            {phase === 'success' && result && (
              <motion.div key="success" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <SuccessScreen
                  shortId={result.shortId}
                  expiresAt={result.expiresAt}
                  fileCount={result.fileCount}
                  totalSize={result.totalSize}
                  encryptionKey={result.encryptionKey}
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
      </div>
    </div>
  )
}
