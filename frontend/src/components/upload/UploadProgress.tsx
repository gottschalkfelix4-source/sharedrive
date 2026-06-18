import { motion } from 'framer-motion'
import { Upload, Zap, Clock } from 'lucide-react'
import { Progress } from '@/components/ui/Progress'

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
      <div className="relative mx-auto w-24 h-24">
        {/* Spinning ring */}
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
          <motion.circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="url(#uploadGrad)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 42}
            strokeDashoffset={2 * Math.PI * 42 * (1 - percent / 100)}
            transition={{ duration: 0.5 }}
          />
          <defs>
            <linearGradient id="uploadGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#8b5cf6" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold text-text-primary">{percent}%</span>
        </div>
      </div>

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
