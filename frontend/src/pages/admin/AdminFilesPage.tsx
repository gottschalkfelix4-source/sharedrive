import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Trash2, Search, Filter } from 'lucide-react'
import { getAdminTransfers, deleteAdminTransfer } from '@/api/admin'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { formatBytes, formatRelative } from '@/lib/utils'
import toast from 'react-hot-toast'

export function AdminFilesPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-transfers', page, search, status],
    queryFn: () => getAdminTransfers(page, search, status),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteAdminTransfer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-transfers'] })
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] })
      toast.success('Transfer gelöscht')
      setDeleteId(null)
    },
    onError: () => toast.error('Löschen fehlgeschlagen'),
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Dateien</h1>
        <p className="text-text-muted text-sm mt-1">Alle Transfers verwalten</p>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex-1 min-w-48">
          <Input
            placeholder="Search by ID or title…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            icon={<Search size={15} />}
          />
        </div>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1) }}
          className="bg-bg-elevated border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">Alle Status</option>
          <option value="active">Aktiv</option>
          <option value="expired">Abgelaufen</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-bg-card border border-border rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-4 py-3 text-text-muted font-medium">Transfer</th>
                    <th className="px-4 py-3 text-text-muted font-medium hidden sm:table-cell">Hochlader</th>
                    <th className="px-4 py-3 text-text-muted font-medium hidden md:table-cell">Größe</th>
                    <th className="px-4 py-3 text-text-muted font-medium hidden md:table-cell">Downloads</th>
                    <th className="px-4 py-3 text-text-muted font-medium">Status</th>
                    <th className="px-4 py-3 text-text-muted font-medium text-right">Aktionen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data?.transfers.map((t) => (
                    <motion.tr
                      key={t.shortId}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-text-primary truncate max-w-[180px] flex items-center gap-1.5">
                          {t.encrypted ? `🔒 Verschlüsselter Transfer` : (t.title || `Transfer ${t.shortId.slice(0, 8)}`)}
                        </p>
                        <p className="text-xs text-text-muted">{t.shortId} · {t.fileCount} Dateien</p>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="text-text-secondary">
                          {t.uploaderUsername ? `@${t.uploaderUsername}` : 'Anonym'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-text-secondary hidden md:table-cell">
                        {formatBytes(t.totalSize)}
                      </td>
                      <td className="px-4 py-3 text-text-secondary hidden md:table-cell">
                        {t.downloadCount}
                      </td>
                      <td className="px-4 py-3">
                        {t.expired ? (
                          <Badge variant="danger">Abgelaufen</Badge>
                        ) : (
                          <Badge variant="success">{formatRelative(t.expiresAt)}</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="danger"
                          size="sm"
                          icon={<Trash2 size={13} />}
                          onClick={() => setDeleteId(t.shortId)}
                        />
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <span className="text-xs text-text-muted">{data?.total ?? 0} gesamt</span>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
                  Zurück
                </Button>
                <span className="text-sm text-text-muted">{page} / {data?.pages ?? 1}</span>
                <Button variant="secondary" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= (data?.pages ?? 1)}>
                  Weiter
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Transfer löschen">
        <p className="text-sm text-text-muted mb-6">
          Diesen Transfer und alle Dateien dauerhaft löschen?
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setDeleteId(null)}>Abbrechen</Button>
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
