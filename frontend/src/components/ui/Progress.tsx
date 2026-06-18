import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

interface ProgressProps {
  value: number
  className?: string
  showLabel?: boolean
  color?: 'primary' | 'success' | 'warning'
  animated?: boolean
}

export function Progress({ value, className, showLabel, color = 'primary', animated = true }: ProgressProps) {
  const colors = {
    primary: 'bg-gradient-primary',
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
  }
  return (
    <div className={cn('relative w-full h-2 bg-white/10 rounded-full overflow-hidden', className)}>
      <motion.div
        className={cn('h-full rounded-full', colors[color])}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        transition={{ duration: animated ? 0.4 : 0, ease: 'easeOut' }}
      />
      {showLabel && (
        <span className="absolute right-0 -top-6 text-xs text-text-secondary">{value}%</span>
      )}
    </div>
  )
}
