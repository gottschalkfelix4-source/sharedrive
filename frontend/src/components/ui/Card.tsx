import { cn } from '@/lib/utils'

interface CardProps {
  children: React.ReactNode
  className?: string
  hover?: boolean
  glow?: boolean
}

export function Card({ children, className, hover, glow }: CardProps) {
  return (
    <div
      className={cn(
        'bg-bg-card border border-border rounded-2xl',
        hover && 'transition-all duration-300 hover:border-border-strong hover:shadow-card-hover hover:-translate-y-0.5 cursor-pointer',
        glow && 'shadow-glow',
        className
      )}
    >
      {children}
    </div>
  )
}

interface StatCardProps {
  title: string
  value: string | number
  icon: React.ReactNode
  trend?: string
  color?: string
}

export function StatCard({ title, value, icon, trend, color = 'text-primary' }: StatCardProps) {
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-text-secondary">{title}</p>
          <p className="text-2xl font-bold text-text-primary mt-1">{value}</p>
          {trend && <p className="text-xs text-text-muted mt-1">{trend}</p>}
        </div>
        <div className={cn('p-3 rounded-xl bg-white/5', color)}>{icon}</div>
      </div>
    </Card>
  )
}
