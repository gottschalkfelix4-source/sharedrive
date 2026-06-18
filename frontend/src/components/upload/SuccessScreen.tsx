import { useState } from 'react'
import { motion } from 'framer-motion'
import { Copy, Check, ExternalLink, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { formatBytes, formatRelative, copyToClipboard } from '@/lib/utils'

interface SuccessScreenProps {
  shortId: string
  expiresAt: string
  fileCount: number
  totalSize: string
  onReset: () => void
}

export function SuccessScreen({ shortId, expiresAt, fileCount, totalSize, onReset }: SuccessScreenProps) {
  const [copied, setCopied] = useState(false)
  const url = `${window.location.origin}/d/${shortId}`

  const handleCopy = async () => {
    await copyToClipboard(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 300 }}
      className="text-center space-y-6"
    >
      {/* Success icon */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 400, delay: 0.1 }}
        className="mx-auto w-20 h-20 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.3, type: 'spring', stiffness: 400 }}
        >
          <Check size={36} className="text-emerald-400" />
        </motion.div>
      </motion.div>

      <div>
        <h2 className="text-2xl font-bold text-text-primary">Transfer ready!</h2>
        <p className="text-text-muted mt-1">
          {fileCount} file{fileCount > 1 ? 's' : ''} · {formatBytes(totalSize)} · expires {formatRelative(expiresAt)}
        </p>
      </div>

      {/* URL box */}
      <div className="flex items-center gap-2 p-3 bg-bg-elevated rounded-xl border border-border group">
        <span className="flex-1 text-sm text-text-secondary truncate text-left">{url}</span>
        <Button
          size="sm"
          variant={copied ? 'secondary' : 'primary'}
          icon={copied ? <Check size={14} /> : <Copy size={14} />}
          onClick={handleCopy}
        >
          {copied ? 'Copied!' : 'Copy'}
        </Button>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          className="flex-1"
          icon={<ExternalLink size={15} />}
          onClick={() => window.open(`/d/${shortId}`, '_blank')}
        >
          Open download page
        </Button>
        <Button
          variant="secondary"
          icon={<RotateCcw size={15} />}
          onClick={onReset}
        >
          New transfer
        </Button>
      </div>
    </motion.div>
  )
}
