import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getLogs } from '@/api/admin'
import type { LogEntry } from '@/api/admin'
import { Spinner } from '@/components/ui/Spinner'
import { ScrollText, RefreshCw, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const LEVELS = ['all', 'info', 'warn', 'error'] as const
const CATEGORIES = ['all', 'upload', 'auth', 'download', 'system', 'error', 'security'] as const

function levelBadge(level: string) {
  switch (level) {
    case 'error': return 'bg-red-500/15 text-red-400 border-red-500/20'
    case 'warn':  return 'bg-amber-500/15 text-amber-400 border-amber-500/20'
    default:      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
  }
}

function categoryBadge(cat: string) {
  switch (cat) {
    case 'upload':   return 'text-sky-400'
    case 'download': return 'text-violet-400'
    case 'auth':     return 'text-orange-400'
    case 'error':    return 'text-red-400'
    case 'security': return 'text-rose-400'
    case 'system':   return 'text-slate-400'
    default:         return 'text-text-muted'
  }
}

function formatTs(ts: string) {
  const d = new Date(ts)
  return d.toLocaleString('de-DE', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

export function AdminLogsPage() {
  const [level, setLevel] = useState('all')
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin-logs', page, level, category, search],
    queryFn: () => getLogs({ page, level, category, search }),
    refetchInterval: autoRefresh ? 5000 : false,
  })

  // Reset page on filter change
  useEffect(() => { setPage(1) }, [level, category, search])

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400)
    return () => clearTimeout(t)
  }, [searchInput])

  const logs: LogEntry[] = data?.logs ?? []

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-500/10 text-slate-400 flex items-center justify-center">
            <ScrollText size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">Protokoll</h1>
            <p className="text-xs text-text-muted">
              {data ? `${data.total} Einträge` : '—'}
              {isFetching && !isLoading && <span className="ml-2 opacity-60">wird aktualisiert…</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
              autoRefresh
                ? 'bg-primary/15 text-primary border-primary/30'
                : 'text-text-muted border-border hover:border-border-strong hover:text-text-primary'
            )}
          >
            <RefreshCw size={12} className={autoRefresh ? 'animate-spin' : ''} />
            Auto-Aktualisierung
          </button>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-text-muted hover:text-text-primary hover:border-border-strong transition-colors"
          >
            <RefreshCw size={12} />
            Aktualisieren
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-bg-card border border-border rounded-2xl p-4 flex flex-wrap gap-3 items-center">
        {/* Level filter */}
        <div className="flex items-center gap-1 rounded-lg bg-bg-elevated border border-border p-0.5">
          {LEVELS.map((l) => (
            <button
              key={l}
              onClick={() => setLevel(l)}
              className={cn(
                'px-3 py-1 rounded-md text-xs font-medium capitalize transition-all',
                level === l
                  ? 'bg-bg-card text-text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-secondary'
              )}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Category filter */}
        <div className="flex items-center gap-1 rounded-lg bg-bg-elevated border border-border p-0.5">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={cn(
                'px-3 py-1 rounded-md text-xs font-medium capitalize transition-all',
                category === c
                  ? 'bg-bg-card text-text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-secondary'
              )}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Nachrichten suchen…"
            className="w-full pl-8 pr-3 py-1.5 bg-bg-elevated border border-border rounded-lg text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-primary/50 transition-colors"
          />
        </div>
      </div>

      {/* Log table */}
      <div className="bg-bg-card border border-border rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-text-muted text-sm">Keine Protokolleinträge gefunden</div>
        ) : (
          <div className="divide-y divide-border/50 font-mono text-xs">
            {logs.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-3 px-4 py-2.5 hover:bg-white/[0.02] transition-colors"
              >
                {/* Timestamp */}
                <span className="text-text-muted flex-shrink-0 pt-px w-32">
                  {formatTs(entry.createdAt)}
                </span>

                {/* Level badge */}
                <span className={cn(
                  'flex-shrink-0 px-1.5 py-0.5 rounded border text-[10px] font-semibold uppercase w-12 text-center',
                  levelBadge(entry.level)
                )}>
                  {entry.level}
                </span>

                {/* Category */}
                <span className={cn('flex-shrink-0 w-20 capitalize pt-px', categoryBadge(entry.category))}>
                  {entry.category}
                </span>

                {/* Message */}
                <span className="text-text-primary flex-1 break-all">{entry.message}</span>

                {/* IP */}
                {entry.ip && (
                  <span className="text-text-muted flex-shrink-0 hidden lg:block">{entry.ip}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {data && data.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <span className="text-xs text-text-muted">
              Seite {page} von {data.pages}
            </span>
            <div className="flex gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="p-1.5 rounded-lg border border-border text-text-muted hover:text-text-primary hover:border-border-strong disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                disabled={page >= data.pages}
                onClick={() => setPage((p) => p + 1)}
                className="p-1.5 rounded-lg border border-border text-text-muted hover:text-text-primary hover:border-border-strong disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
