import { motion } from 'framer-motion'
import { ShieldCheck, ShieldOff, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ProgressRing } from '@/components/ui/ProgressRing'

interface VirusScanProgressProps {
  percent: number
  currentFile: string | null
  fileCount: number
  phase?: 'streaming' | 'analyzing'
}

export function VirusScanProgress({ percent, currentFile, fileCount, phase = 'streaming' }: VirusScanProgressProps) {
  const analyzing = phase === 'analyzing'

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="text-center space-y-6"
    >
      <ProgressRing percent={percent} colorFrom="#10b981" colorTo="#22d3ee" indeterminate={analyzing}>
        <motion.div
          animate={analyzing ? { scale: [1, 1.08, 1] } : { scale: 1 }}
          transition={analyzing ? { duration: 1.1, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
        >
          <ShieldCheck size={28} className="text-emerald-400" />
        </motion.div>
      </ProgressRing>

      <div>
        <p className="text-lg font-semibold text-text-primary">
          {fileCount} Datei{fileCount > 1 ? 'en werden' : ' wird'} auf Viren geprüft…
        </p>
        <p className="text-sm text-text-muted mt-1 truncate px-4">
          {analyzing
            ? (currentFile ? `„${currentFile}“ wird analysiert…` : 'Wird analysiert…')
            : (currentFile ? `„${currentFile}“ — ${percent}%` : `${percent}%`)}
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
