import { motion } from 'framer-motion'
import { Zap, Clock } from 'lucide-react'
import { ProgressRing } from '@/components/ui/ProgressRing'

interface UploadProgressProps {
  percent: number
  speed: string
  eta: string
  fileCount: number
}

export function UploadProgress({ percent, speed, eta, fileCount }: UploadProgressProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="text-center space-y-6"
    >
      <ProgressRing percent={percent} colorFrom="#6366f1" colorTo="#8b5cf6">
        <motion.span
          key={percent}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-lg font-bold text-text-primary"
        >
          {percent}%
        </motion.span>
      </ProgressRing>

      <div>
        <p className="text-lg font-semibold text-text-primary">{fileCount} Datei{fileCount > 1 ? 'en werden' : ' wird'} hochgeladen…</p>
        <p className="text-sm text-text-muted mt-1">Bitte diesen Tab nicht schließen</p>
      </div>

      <div className="flex items-center justify-center gap-6 text-sm text-text-secondary">
        <span className="flex items-center gap-1.5">
          <Zap size={14} className="text-primary" />
          {speed}
        </span>
        <span className="flex items-center gap-1.5">
          <Clock size={14} className="text-primary" />
          {eta} verbleibend
        </span>
      </div>
    </motion.div>
  )
}
