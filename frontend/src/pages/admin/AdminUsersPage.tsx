import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Shield, ShieldOff, Trash2, UserCircle2 } from 'lucide-react'
import { getAdminUsers, updateUserRole, deleteUser } from '@/api/admin'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { formatBytes, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'

export function AdminUsersPage() {
  const { user: currentUser } = useAuthStore()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', page],
    queryFn: () => getAdminUsers(page),
  })

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: 'USER' | 'ADMIN' }) => updateUserRole(id, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      toast.success('Rolle aktualisiert')
    },
    onError: () => toast.error('Rolle konnte nicht aktualisiert werden'),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] })
      toast.success('Benutzer gelöscht')
      setDeleteId(null)
    },
    onError: () => toast.error('Benutzer konnte nicht gelöscht werden'),
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Benutzer</h1>
        <p className="text-text-muted text-sm mt-1">{data?.total ?? '…'} registrierte Benutzer</p>
      </div>

      <div className="bg-bg-card border border-border rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-4 py-3 text-text-muted font-medium">Benutzer</th>
                    <th className="px-4 py-3 text-text-muted font-medium hidden sm:table-cell">Speicher</th>
                    <th className="px-4 py-3 text-text-muted font-medium hidden md:table-cell">Transfers</th>
                    <th className="px-4 py-3 text-text-muted font-medium hidden lg:table-cell">Beigetreten</th>
                    <th className="px-4 py-3 text-text-muted font-medium">Rolle</th>
                    <th className="px-4 py-3 text-text-muted font-medium text-right">Aktionen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data?.users.map((u) => (
                    <motion.tr
                      key={u.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                            <UserCircle2 size={18} className="text-primary" />
                          </div>
                          <div>
                            <p className="font-medium text-text-primary">@{u.username}</p>
                            <p className="text-xs text-text-muted">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-text-secondary hidden sm:table-cell">
                        {formatBytes(u.storageUsed)}
                      </td>
                      <td className="px-4 py-3 text-text-secondary hidden md:table-cell">
                        {u.transferCount}
                      </td>
                      <td className="px-4 py-3 text-text-secondary hidden lg:table-cell text-xs">
                        {formatDate(u.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={u.role === 'ADMIN' ? 'info' : 'default'}>
                          {u.role}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {u.id !== currentUser?.id && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                icon={u.role === 'ADMIN' ? <ShieldOff size={13} /> : <Shield size={13} />}
                                onClick={() => roleMutation.mutate({ id: u.id, role: u.role === 'ADMIN' ? 'USER' : 'ADMIN' })}
                              />
                              <Button
                                variant="danger"
                                size="sm"
                                icon={<Trash2 size={13} />}
                                onClick={() => setDeleteId(u.id)}
                              />
                            </>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>

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

      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Benutzer löschen">
        <p className="text-sm text-text-muted mb-6">
          Dieser Benutzer und alle Daten werden dauerhaft gelöscht. Dies kann nicht rückgängig gemacht werden.
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
            Benutzer löschen
          </Button>
        </div>
      </Modal>
    </div>
  )
}
