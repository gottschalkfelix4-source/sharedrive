import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Save, HardDrive } from 'lucide-react'
import { getAllSettings, updateSettings } from '@/api/settings'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { formatBytes } from '@/lib/utils'
import toast from 'react-hot-toast'

function bytesToGB(bytes: string) { return (parseInt(bytes) / 1e9).toString() }
function gbToBytes(gb: string) { return Math.round(parseFloat(gb) * 1e9).toString() }

export function StorageSettings() {
  const { data: settings, isLoading } = useQuery({ queryKey: ['admin-settings'], queryFn: getAllSettings })

  const [form, setForm] = useState({
    maxFileSizeGB: '5',
    maxTransferSizeGB: '10',
    retentionAnonymous: '7',
    retentionRegistered: '30',
  })

  useEffect(() => {
    if (settings) {
      setForm({
        maxFileSizeGB: bytesToGB(settings['storage.maxFileSizeBytes'] || '5368709120'),
        maxTransferSizeGB: bytesToGB(settings['storage.maxTransferSizeBytes'] || '10737418240'),
        retentionAnonymous: settings['storage.retentionDaysAnonymous'] || '7',
        retentionRegistered: settings['storage.retentionDaysRegistered'] || '30',
      })
    }
  }, [settings])

  const mutation = useMutation({
    mutationFn: (f: typeof form) =>
      updateSettings({
        'storage.maxFileSizeBytes': gbToBytes(f.maxFileSizeGB),
        'storage.maxTransferSizeBytes': gbToBytes(f.maxTransferSizeGB),
        'storage.retentionDaysAnonymous': f.retentionAnonymous,
        'storage.retentionDaysRegistered': f.retentionRegistered,
      }),
    onSuccess: () => toast.success('Settings saved'),
    onError: () => toast.error('Failed to save'),
  })

  if (isLoading) return <div className="flex justify-center py-8"><Spinner /></div>

  return (
    <div className="bg-bg-card border border-border rounded-2xl p-6 space-y-6">
      <div className="flex items-center gap-3 pb-4 border-b border-border">
        <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-400 flex items-center justify-center">
          <HardDrive size={20} />
        </div>
        <div>
          <h2 className="font-semibold text-text-primary">Storage & Limits</h2>
          <p className="text-xs text-text-muted">File sizes, transfer limits and retention policy</p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Max file size (GB)"
            type="number"
            min="0.1"
            step="0.5"
            value={form.maxFileSizeGB}
            onChange={(e) => setForm({ ...form, maxFileSizeGB: e.target.value })}
            hint={`≈ ${formatBytes(gbToBytes(form.maxFileSizeGB))} per file`}
          />
          <Input
            label="Max transfer size (GB)"
            type="number"
            min="0.1"
            step="1"
            value={form.maxTransferSizeGB}
            onChange={(e) => setForm({ ...form, maxTransferSizeGB: e.target.value })}
            hint={`≈ ${formatBytes(gbToBytes(form.maxTransferSizeGB))} total`}
          />
        </div>

        <div>
          <h3 className="text-sm font-semibold text-text-primary mb-3">Retention Policy</h3>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Anonymous transfers (days)"
              type="number"
              min="1"
              max="365"
              value={form.retentionAnonymous}
              onChange={(e) => setForm({ ...form, retentionAnonymous: e.target.value })}
              hint="Files from non-registered users"
            />
            <Input
              label="Registered users (days)"
              type="number"
              min="1"
              max="365"
              value={form.retentionRegistered}
              onChange={(e) => setForm({ ...form, retentionRegistered: e.target.value })}
              hint="Files from registered accounts"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-2 border-t border-border">
        <Button icon={<Save size={15} />} loading={mutation.isPending} onClick={() => mutation.mutate(form)}>
          Save changes
        </Button>
      </div>
    </div>
  )
}
