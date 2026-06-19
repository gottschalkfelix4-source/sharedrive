import { useId } from 'react'
import { motion } from 'framer-motion'

interface ProgressRingProps {
  percent: number
  colorFrom: string
  colorTo: string
  size?: number
  strokeWidth?: number
  /** Spinning indeterminate arc instead of a percent-filled ring — for phases with no measurable progress. */
  indeterminate?: boolean
  children?: React.ReactNode
}

export function ProgressRing({
  percent,
  colorFrom,
  colorTo,
  size = 96,
  strokeWidth = 8,
  indeterminate = false,
  children,
}: ProgressRingProps) {
  const gradientId = useId()
  const r = (size - strokeWidth) / 2
  const center = size / 2
  const circumference = 2 * Math.PI * r

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={center} cy={center} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={strokeWidth} />
        {indeterminate ? (
          <motion.circle
            cx={center}
            cy={center}
            r={r}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${circumference * 0.25} ${circumference}`}
            style={{ originX: '50%', originY: '50%' }}
            animate={{ rotate: 360 }}
            transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
          />
        ) : (
          <motion.circle
            cx={center}
            cy={center}
            r={r}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={false}
            animate={{ strokeDashoffset: circumference * (1 - percent / 100) }}
            transition={{ duration: 0 }}
          />
        )}
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={colorFrom} />
            <stop offset="100%" stopColor={colorTo} />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  )
}
