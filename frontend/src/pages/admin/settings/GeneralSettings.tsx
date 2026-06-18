import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Save, Globe } from 'lucide-react'
import { getAllSettings, updateSettings } from '@/api/settings'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import toast from 'react-hot-toast'

export function GeneralSettings() {
  const { data: settings, isLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: getAllSettings,
  })

  const [form, setForm] = useState({ 'app.name': '', 'app.baseUrl': '', 'app.description': '', 'app.maxFilesPerTransfer': '100' })

  useEffect(() => {
    if (settings) {
      setForm({
        'app.name': settings['app.name'] || '',
        'app.baseUrl': settings['app.baseUrl'] || '',
        'app.description': settings['app.description'] || '',
        'app.maxFilesPerTransfer': settings['app.maxFilesPerTransfer'] || '100',
      })
    }
  }, [settings])

  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => toast.success('Settings saved'),
    onError: () => toast.error('Failed to save'),
  })

  if (isLoading) return <div className="flex justify-center py-8"><Spinner /></div>

  return (
    <div className="bg-bg-card border border-border rounded-2xl p-6 space-y-6">
      <div className="flex items-center gap-3 pb-4 border-b border-border">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <Globe size={20} />
        </div>
        <div>
          <h2 className="font-semibold text-text-primary">General Settings</h2>
          <p className="text-xs text-text-muted">Basic application configuration</p>
        </div>
      </div>

      <div className="space-y-4">
        <Input
          label="Application Name"
          value={form['app.name']}
          onChange={(e) => setForm({ ...form, 'app.name': e.target.value })}
          hint="Displayed in the browser tab and emails"
        />
        <Input
          label="Base URL"
          placeholder="https://share.yourdomain.com"
          value={form['app.baseUrl']}
          onChange={(e) => setForm({ ...form, 'app.baseUrl': e.target.value })}
          icon={<Globe size={15} />}
          hint="Public URL of this instance — used in download links and emails. No trailing slash."
        />
        <Textarea
          label="Description"
          rows={3}
          value={form['app.description']}
          onChange={(e) => setForm({ ...form, 'app.description': e.target.value })}
          hint="Shown on the homepage"
        />
        <Input
          label="Max files per transfer"
          type="number"
          min="1"
          max="1000"
          value={form['app.maxFilesPerTransfer']}
          onChange={(e) => setForm({ ...form, 'app.maxFilesPerTransfer': e.target.value })}
          hint="Maximum number of files allowed in a single transfer"
        />
      </div>

      <div className="flex justify-end pt-2 border-t border-border">
        <Button
          icon={<Save size={15} />}
          loading={mutation.isPending}
          onClick={() => mutation.mutate(form)}
        >
          Save changes
        </Button>
      </div>
    </div>
  )
}
