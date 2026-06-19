import { motion } from 'framer-motion'
import { ShieldCheck, ShieldOff, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface VirusScanProgressProps {
  percent: number
  currentFile: string | null
  fileCount: number
}

export function VirusScanProgress({ percent, currentFile, fileCount }: VirusScanProgressProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="text-center space-y-6"
    >
      <div className="relative mx-auto w-24 h-24">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
          <motion.circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="url(#scanGrad)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 42}
            strokeDashoffset={2 * Math.PI * 42 * (1 - percent / 100)}
            transition={{ duration: 0.5 }}
          />
          <defs>
            <linearGradient id="scanGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <ShieldCheck size={28} className="text-emerald-400" />
        </div>
      </div>

      <div>
        <p className="text-lg font-semibold text-text-primary">
          {fileCount} Datei{fileCount > 1 ? 'en werden' : ' wird'} auf Viren geprüft…
        </p>
        <p className="text-sm text-text-muted mt-1 truncate px-4">
          {currentFile ? `„${currentFile}“ — ${percent}%` : `${percent}%`}
        </p>
      </div>
    </motion.div>
  )
}

interface VirusScanResultProps {
  type: 'infected' | 'error'
  virus?: string
  infectedFile?: string
  message?: string
  onReset: () => void
}

export function VirusScanResult({ type, virus, infectedFile, message, onReset }: VirusScanResultProps) {
  const isInfected = type === 'infected'

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="text-center space-y-6"
    >
      <div className="mx-auto w-20 h-20 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
        {isInfected
          ? <ShieldOff size={32} className="text-red-400" />
          : <AlertCircle size={32} className="text-red-400" />}
      </div>

      <div>
        <p className="text-lg font-semibold text-text-primary">
          {isInfected ? 'Bedrohung erkannt' : 'Virenscan fehlgeschlagen'}
        </p>
        <p className="text-sm text-red-300 mt-2 px-4">
          {isInfected
            ? <>„{infectedFile}“ enthält: <span className="font-semibold">{virus}</span></>
            : message || 'Der Virenscanner ist derzeit nicht erreichbar.'}
        </p>
        <p className="text-xs text-text-muted mt-2">
          {isInfected
            ? 'Der Upload wurde abgelehnt, alle Dateien wurden gelöscht.'
            : 'Der Upload wurde abgebrochen. Bitte versuche es später erneut.'}
        </p>
      </div>

      <Button variant="secondary" onClick={onReset}>
        Erneut versuchen
      </Button>
    </motion.div>
  )
}
