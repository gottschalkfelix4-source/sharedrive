import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { ExternalLink, Trash2, Download, Clock, HardDrive, Upload } from 'lucide-react'
import { getMyTransfers, deleteTransfer } from '@/api/transfers'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, StatCard } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import { formatBytes, formatRelative, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'

export function DashboardPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['my-transfers', page],
    queryFn: () => getMyTransfers(page),
    enabled: !!user,
  })

  const deleteMutation = useMutation({
    mutationFn: deleteTransfer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-transfers'] })
      toast.success('Transfer gelöscht')
      setDeleteId(null)
    },
    onError: () => toast.error('Transfer konnte nicht gelöscht werden'),
  })

  const now = new Date()

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Meine Transfers</h1>
            <p className="text-text-muted text-sm mt-1">Dein Upload-Verlauf</p>
          </div>
          <Link to="/">
            <Button icon={<Upload size={16} />}>Neuer Transfer</Button>
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
          <StatCard
            title="Speicher genutzt"
            value={formatBytes(user?.storageUsed || '0')}
            icon={<HardDrive size={20} />}
          />
          <StatCard
            title="Transfers gesamt"
            value={data?.total ?? '…'}
            icon={<Upload size={20} />}
          />
          <StatCard
            title="Aktive Transfers"
            value={data?.transfers.filter((t) => new Date(t.expiresAt) > now).length ?? '…'}
            icon={<Clock size={20} />}
          />
        </div>

        {/* Transfers table */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : data?.transfers.length === 0 ? (
          <div className="text-center py-16">
            <Upload size={40} className="mx-auto text-text-muted mb-4" />
            <p className="text-text-muted">Noch keine Transfers. Lade deine ersten Dateien hoch!</p>
            <Link to="/" className="mt-4 inline-block">
              <Button className="mt-4">Jetzt hochladen</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {data?.transfers.map((t, i) => {
              const expired = new Date(t.expiresAt) <= now
              return (
                <motion.div
                  key={t.shortId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={`bg-bg-card border rounded-xl p-4 flex items-center gap-4 ${expired ? 'border-border opacity-60' : 'border-border'}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-text-primary truncate">
                        {t.title || `Transfer ${t.shortId}`}
                      </p>
                      {t.passwordProtected && (
                        <Badge variant="warning">🔒 Passwort</Badge>
                      )}
                      {expired ? (
                        <Badge variant="danger">Abgelaufen</Badge>
                      ) : (
                        <Badge variant="success">Aktiv</Badge>
                      )}
                    </div>
                    <p className="text-xs text-text-muted mt-1">
                      {t.files.length} Datei{t.files.length > 1 ? 'en' : ''} · {formatBytes(t.totalSize)} · {expired ? 'Abgelaufen' : `Läuft ab ${formatRelative(t.expiresAt)}`} · {t.downloadCount} Downloads
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {!expired && (
                      <Link to={`/d/${t.shortId}`} target="_blank">
                        <Button variant="ghost" size="sm" icon={<ExternalLink size={14} />} />
                      </Link>
                    )}
                    <Button
                      variant="danger"
                      size="sm"
                      icon={<Trash2 size={14} />}
                      onClick={() => setDeleteId(t.shortId)}
                    />
                  </div>
                </motion.div>
              )
            })}

            {/* Pagination */}
            {(data?.pages ?? 1) > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <Button variant="secondary" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
                  Zurück
                </Button>
                <span className="text-sm text-text-muted">
                  {page} / {data?.pages}
                </span>
                <Button variant="secondary" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= (data?.pages ?? 1)}>
                  Weiter
                </Button>
              </div>
            )}
          </div>
        )}
      </motion.div>

      {/* Delete confirm modal */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Transfer löschen">
        <p className="text-sm text-text-muted mb-6">
          Dieser Transfer und alle Dateien werden dauerhaft gelöscht. Dies kann nicht rückgängig gemacht werden.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setDeleteId(null)}>
            Abbrechen
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            loading={deleteMutation.isPending}
            icon={<Trash2 size={15} />}
            onClick={() => deleteId && deleteMutation.mutate(deleteId)}
          >
            Löschen
          </Button>
        </div>
      </Modal>
    </div>
  )
}
