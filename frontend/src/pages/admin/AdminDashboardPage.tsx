import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Users, Files, Download, HardDrive, TrendingUp, AlertCircle, RefreshCw } from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { getAdminStats } from '@/api/admin'
import { StatCard } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatBytes, formatRelative } from '@/lib/utils'

function SkeletonCard() {
  return (
    <div className="bg-bg-card border border-border rounded-2xl p-6 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-3 w-24 bg-white/10 rounded-full" />
          <div className="h-7 w-16 bg-white/10 rounded-full" />
        </div>
        <div className="w-11 h-11 rounded-xl bg-white/5" />
      </div>
    </div>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
        <AlertCircle size={24} className="text-red-400" />
      </div>
      <div className="text-center">
        <p className="text-text-primary font-medium">Dashboard-Daten konnten nicht geladen werden</p>
        <p className="text-text-muted text-sm mt-1">Stelle sicher, dass das Backend läuft und du angemeldet bist.</p>
      </div>
      <Button variant="secondary" icon={<RefreshCw size={15} />} onClick={onRetry}>
        Erneut versuchen
      </Button>
    </div>
  )
}

export function AdminDashboardPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: getAdminStats,
    refetchInterval: 30000,
    retry: 2,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
        <p className="text-text-muted text-sm mt-1">Übersicht der ShareDrive-Instanz</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : isError || !data ? (
          <div className="col-span-4">
            <ErrorState onRetry={refetch} />
          </div>
        ) : (
          <>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}>
              <StatCard title="Benutzer gesamt" value={data.totalUsers} icon={<Users size={20} />} color="text-indigo-400" />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
              <StatCard title="Aktive Transfers" value={data.activeTransfers} icon={<Files size={20} />} color="text-emerald-400" />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <StatCard title="Downloads heute" value={data.downloadsToday} icon={<Download size={20} />} color="text-sky-400" />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <StatCard title="Speicher genutzt" value={formatBytes(data.storageUsedBytes)} icon={<HardDrive size={20} />} color="text-violet-400" />
            </motion.div>
          </>
        )}
      </div>

      {data && (
        <>
          {/* Download chart */}
          <div className="bg-bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-base font-semibold text-text-primary">Downloads</h2>
                <p className="text-xs text-text-muted mt-0.5">Letzte 7 Tage</p>
              </div>
              <TrendingUp size={18} className="text-primary" />
            </div>

            {data.downloadHistory.every((d) => d.count === 0) ? (
              <div className="h-[200px] flex items-center justify-center text-text-muted text-sm">
                Noch keine Downloads in den letzten 7 Tagen
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={data.downloadHistory}>
                  <defs>
                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickFormatter={(v) => v.slice(5)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f0f26',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '12px',
                      color: '#f1f5f9',
                      fontSize: '13px',
                    }}
                    labelFormatter={(l) => `Datum: ${l}`}
                    formatter={(v: number) => [v, 'Downloads']}
                  />
                  <Area type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} fill="url(#areaGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Recent transfers */}
          <div className="bg-bg-card border border-border rounded-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-base font-semibold text-text-primary">Aktuelle Transfers</h2>
              <Link to="/admin/files" className="text-xs text-primary hover:underline">Alle anzeigen</Link>
            </div>

            {data.recentTransfers.length === 0 ? (
              <div className="px-6 py-10 text-center text-text-muted text-sm">
                Noch keine Transfers. Lade etwas hoch, um loszulegen!
              </div>
            ) : (
              <div className="divide-y divide-border">
                {data.recentTransfers.map((t) => (
                  <div key={t.shortId} className="flex items-center gap-4 px-6 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">
                        {t.title || `Transfer ${t.shortId}`}
                      </p>
                      <p className="text-xs text-text-muted">
                        {t.uploaderUsername ? `@${t.uploaderUsername}` : 'Anonym'} · {formatBytes(t.totalSize)} · {t.fileCount} Dateien
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge variant="info">{t.downloadCount} DL</Badge>
                      <span className="text-xs text-text-muted">{formatRelative(t.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
