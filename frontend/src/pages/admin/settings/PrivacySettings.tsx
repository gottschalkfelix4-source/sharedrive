import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Save, ShieldCheck } from 'lucide-react'
import { getAllSettings, updateSettings } from '@/api/settings'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import toast from 'react-hot-toast'

export function PrivacySettings() {
  const { data: settings, isLoading } = useQuery({ queryKey: ['admin-settings'], queryFn: getAllSettings })

  const [form, setForm] = useState({
    logRetentionDays: '30',
    privacyPolicy: '',
    imprint: '',
  })

  useEffect(() => {
    if (settings) {
      setForm({
        logRetentionDays: settings['privacy.logRetentionDays'] || '30',
        privacyPolicy: settings['legal.privacyPolicy'] || '',
        imprint: settings['legal.imprint'] || '',
      })
    }
  }, [settings])

  const mutation = useMutation({
    mutationFn: (f: typeof form) =>
      updateSettings({
        'privacy.logRetentionDays': f.logRetentionDays,
        'legal.privacyPolicy': f.privacyPolicy,
        'legal.imprint': f.imprint,
      }),
    onSuccess: () => toast.success('Einstellungen gespeichert'),
    onError: () => toast.error('Speichern fehlgeschlagen'),
  })

  if (isLoading) return <div className="flex justify-center py-8"><Spinner /></div>

  return (
    <div className="bg-bg-card border border-border rounded-2xl p-6 space-y-6">
      <div className="flex items-center gap-3 pb-4 border-b border-border">
        <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-400 flex items-center justify-center">
          <ShieldCheck size={20} />
        </div>
        <div>
          <h2 className="font-semibold text-text-primary">Datenschutz & Recht</h2>
          <p className="text-xs text-text-muted">DSGVO-Einstellungen, Datenschutzerklärung und Impressum</p>
        </div>
      </div>

      <div className="space-y-6">
        <Input
          label="Log-Aufbewahrung (Tage)"
          type="number"
          min="1"
          max="365"
          value={form.logRetentionDays}
          onChange={(e) => setForm({ ...form, logRetentionDays: e.target.value })}
          hint="Protokolleinträge werden nach dieser Zeit automatisch gelöscht. IPs werden bereits beim Speichern anonymisiert."
        />

        <div className="space-y-2">
          <label className="block text-sm font-medium text-text-primary">
            Datenschutzerklärung
          </label>
          <textarea
            rows={12}
            className="w-full rounded-xl border border-border bg-bg px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y font-mono"
            placeholder="Datenschutzerklärung hier eingeben…"
            value={form.privacyPolicy}
            onChange={(e) => setForm({ ...form, privacyPolicy: e.target.value })}
          />
          <p className="text-xs text-text-muted">Wird unter /datenschutz öffentlich angezeigt. Zeilenumbrüche werden erhalten.</p>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-text-primary">
            Impressum
          </label>
          <textarea
            rows={8}
            className="w-full rounded-xl border border-border bg-bg px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y font-mono"
            placeholder="Impressum hier eingeben…"
            value={form.imprint}
            onChange={(e) => setForm({ ...form, imprint: e.target.value })}
          />
          <p className="text-xs text-text-muted">Wird unter /impressum öffentlich angezeigt.</p>
        </div>
      </div>

      <div className="flex justify-end pt-2 border-t border-border">
        <Button icon={<Save size={15} />} loading={mutation.isPending} onClick={() => mutation.mutate(form)}>
          Änderungen speichern
        </Button>
      </div>
    </div>
  )
}
