import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import {
  ExternalLink, Trash2, Download, Clock, HardDrive, Upload,
  Copy, QrCode, CalendarClock, Send, BarChart3, Globe2, Monitor,
} from 'lucide-react'
import { getMyTransfers, deleteTransfer, updateTransfer, resendTransferLink, getTransferDownloads } from '@/api/transfers'
import { getDiskStats } from '@/api/settings'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, StatCard } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { formatBytes, formatRelative, formatDate, copyToClipboard } from '@/lib/utils'
import toast from 'react-hot-toast'

export function DashboardPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [qrId, setQrId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [editExpiresAt, setEditExpiresAt] = useState('')
  const [editMaxDownloads, setEditMaxDownloads] = useState('')
  const [resendId, setResendId] = useState<string | null>(null)
  const [resendEmail, setResendEmail] = useState('')
  const [downloadsId, setDownloadsId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['my-transfers', page],
    queryFn: () => getMyTransfers(page),
    enabled: !!user,
  })

  const { data: diskStats } = useQuery({
    queryKey: ['disk-stats'],
    queryFn: getDiskStats,
    staleTime: 30_000,
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

  const updateMutation = useMutation({
    mutationFn: ({ shortId, data }: { shortId: string; data: { expiresAt?: string; maxDownloads?: number | null } }) =>
      updateTransfer(shortId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-transfers'] })
      toast.success('Transfer aktualisiert')
      setEditId(null)
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Aktualisierung fehlgeschlagen'),
  })

  const resendMutation = useMutation({
    mutationFn: ({ shortId, email }: { shortId: string; email: string }) => resendTransferLink(shortId, email),
    onSuccess: () => {
      toast.success('Link wurde versendet')
      setResendId(null)
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Versand fehlgeschlagen'),
  })

  const { data: downloadsData, isLoading: downloadsLoading } = useQuery({
    queryKey: ['transfer-downloads', downloadsId],
    queryFn: () => getTransferDownloads(downloadsId!),
    enabled: !!downloadsId,
  })

  const openEdit = (shortId: string, expiresAt: string, maxDownloads?: number | null) => {
    setEditId(shortId)
    setEditExpiresAt(new Date(expiresAt).toISOString().slice(0, 10))
    setEditMaxDownloads(maxDownloads != null ? String(maxDownloads) : '')
  }

  const handleEditSubmit = () => {
    if (!editId) return
    const data: { expiresAt?: string; maxDownloads?: number | null } = {}
    if (editExpiresAt) {
      data.expiresAt = new Date(`${editExpiresAt}T23:59:59`).toISOString()
    }
    data.maxDownloads = editMaxDownloads ? parseInt(editMaxDownloads) : null
    updateMutation.mutate({ shortId: editId, data })
  }

  const openResend = (shortId: string, notifyEmail?: string | null) => {
    setResendId(shortId)
    setResendEmail(notifyEmail || '')
  }

  const handleResendSubmit = () => {
    if (!resendId || !resendEmail) return
    resendMutation.mutate({ shortId: resendId, email: resendEmail })
  }

  const shareUrl = (shortId: string) => `${window.location.origin}/d/${shortId}`

  const handleCopy = async (shortId: string) => {
    await copyToClipboard(shareUrl(shortId))
    toast.success('Link kopiert')
  }

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
          {diskStats ? (() => {
            const pct = diskStats.pct
            const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-primary'
            return (
              <Card className="p-6">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-sm text-text-secondary">Server-Speicher</p>
                    <p className="text-2xl font-bold text-text-primary mt-1">{pct}%</p>
                  </div>
                  <div className="p-3 rounded-xl bg-white/5 text-primary"><HardDrive size={20} /></div>
                </div>
                <div className="h-1.5 bg-border rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-[width] duration-500 ${barColor}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </Card>
            )
          })() : (
            <StatCard
              title="Speicher genutzt"
              value={formatBytes(user?.storageUsed || '0')}
              icon={<HardDrive size={20} />}
            />
          )}
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
                      <>
                        <Link to={`/d/${t.shortId}`} target="_blank">
                          <Button variant="ghost" size="sm" icon={<ExternalLink size={14} />} />
                        </Link>
                        <Button variant="ghost" size="sm" icon={<Copy size={14} />} onClick={() => handleCopy(t.shortId)} />
                        <Button variant="ghost" size="sm" icon={<QrCode size={14} />} onClick={() => setQrId(t.shortId)} />
                        <Button variant="ghost" size="sm" icon={<Send size={14} />} onClick={() => openResend(t.shortId, t.notifyEmail)} />
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<CalendarClock size={14} />}
                      onClick={() => openEdit(t.shortId, t.expiresAt, t.maxDownloads)}
                    />
                    {t.downloadCount > 0 && (
                      <Button variant="ghost" size="sm" icon={<BarChart3 size={14} />} onClick={() => setDownloadsId(t.shortId)} />
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

      {/* QR code modal */}
      <Modal open={!!qrId} onClose={() => setQrId(null)} title="QR-Code">
        {qrId && (
          <div className="flex flex-col items-center gap-4">
            <div className="p-4 bg-white rounded-xl">
              <QRCodeSVG value={shareUrl(qrId)} size={200} />
            </div>
            <p className="text-xs text-text-muted text-center break-all">{shareUrl(qrId)}</p>
          </div>
        )}
      </Modal>

      {/* Edit (extend expiry / set download limit) modal */}
      <Modal open={!!editId} onClose={() => setEditId(null)} title="Transfer bearbeiten">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-text-secondary block mb-1.5">Neues Ablaufdatum</label>
            <input
              type="date"
              value={editExpiresAt}
              onChange={(e) => setEditExpiresAt(e.target.value)}
              className="w-full bg-bg-elevated border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
            />
          </div>
          <Input
            type="number"
            min={1}
            label="Downloadlimit (leer = unbegrenzt)"
            placeholder="z. B. 5"
            value={editMaxDownloads}
            onChange={(e) => setEditMaxDownloads(e.target.value)}
          />
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setEditId(null)}>
              Abbrechen
            </Button>
            <Button
              className="flex-1"
              loading={updateMutation.isPending}
              icon={<CalendarClock size={15} />}
              onClick={handleEditSubmit}
            >
              Speichern
            </Button>
          </div>
        </div>
      </Modal>

      {/* Resend link modal */}
      <Modal open={!!resendId} onClose={() => setResendId(null)} title="Link erneut senden">
        <div className="space-y-4">
          <Input
            type="email"
            label="E-Mail-Adresse"
            placeholder="empfaenger@example.com"
            value={resendEmail}
            onChange={(e) => setResendEmail(e.target.value)}
          />
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setResendId(null)}>
              Abbrechen
            </Button>
            <Button
              className="flex-1"
              loading={resendMutation.isPending}
              icon={<Send size={15} />}
              disabled={!resendEmail}
              onClick={handleResendSubmit}
            >
              Senden
            </Button>
          </div>
        </div>
      </Modal>

      {/* Download details modal */}
      <Modal open={!!downloadsId} onClose={() => setDownloadsId(null)} title="Download-Details">
        {downloadsLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : downloadsData?.downloads.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-4">Noch keine Downloads erfasst.</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {downloadsData?.downloads.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 p-3 bg-bg-elevated rounded-xl border border-border">
                <div className="flex items-center gap-2 text-sm text-text-primary">
                  <Globe2 size={14} className="text-text-muted" />
                  {d.country || 'Unbekannt'}
                </div>
                <div className="flex items-center gap-2 text-sm text-text-secondary">
                  <Monitor size={14} className="text-text-muted" />
                  {[d.browser, d.os].filter(Boolean).join(' · ') || 'Unbekannt'}
                </div>
                <span className="text-xs text-text-muted">{formatDate(d.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}
