import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Save, Globe, FlaskConical, Copy, Check } from 'lucide-react'
import { getAllSettings, updateSettings } from '@/api/settings'
import { getDiagToken } from '@/api/admin'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import toast from 'react-hot-toast'

function DiagCard() {
  const { data, isLoading } = useQuery({ queryKey: ['diag-token'], queryFn: getDiagToken })
  const [copied, setCopied] = useState<string | null>(null)

  const baseUrl = window.location.origin
  const token = data?.token ?? ''
  const infoUrl = `${baseUrl}/api/diag?key=${token}`
  const uploadUrl = `${baseUrl}/api/diag/upload?key=${token}`

  const copy = (label: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="bg-bg-card border border-border rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-3 pb-4 border-b border-border">
        <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-400 flex items-center justify-center">
          <FlaskConical size={20} />
        </div>
        <div>
          <h2 className="font-semibold text-text-primary">Diagnostic Endpoints</h2>
          <p className="text-xs text-text-muted">Use these URLs to test connectivity and upload capacity</p>
        </div>
      </div>

      {isLoading ? <Spinner /> : (
        <div className="space-y-3">
          {[
            { label: 'Info (GET)', url: infoUrl, hint: 'Returns headers, IP, proxy info' },
            { label: 'Upload test (POST)', url: uploadUrl, hint: 'Send any body — returns bytes received' },
          ].map(({ label, url, hint }) => (
            <div key={label}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-text-secondary">{label}</span>
                <span className="text-xs text-text-muted">{hint}</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-bg-elevated border border-border rounded-lg px-3 py-2 text-text-primary font-mono truncate">
                  {url}
                </code>
                <button
                  onClick={() => copy(label, url)}
                  className="p-2 rounded-lg border border-border text-text-muted hover:text-text-primary hover:border-border-strong transition-colors flex-shrink-0"
                  title="Copy URL"
                >
                  {copied === label ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          ))}
          <p className="text-xs text-text-muted pt-1">
            The key is derived from your JWT_SECRET and resets on restart.
          </p>
        </div>
      )}
    </div>
  )
}

export function GeneralSettings() {
  const { data: settings, isLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: getAllSettings,
  })

  const [form, setForm] = useState({
    'app.name': '',
    'app.baseUrl': '',
    'app.description': '',
    'app.maxFilesPerTransfer': '100',
  })

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
    <div className="space-y-5">
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

      <DiagCard />
    </div>
  )
}
