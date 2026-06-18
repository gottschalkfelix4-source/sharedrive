import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Save, Palette } from 'lucide-react'
import { getAllSettings, updateSettings } from '@/api/settings'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import toast from 'react-hot-toast'

const presetColors = [
  { label: 'Indigo', value: '#6366f1' },
  { label: 'Violet', value: '#8b5cf6' },
  { label: 'Sky', value: '#0ea5e9' },
  { label: 'Emerald', value: '#10b981' },
  { label: 'Rose', value: '#f43f5e' },
  { label: 'Amber', value: '#f59e0b' },
]

export function AppearanceSettings() {
  const { data: settings, isLoading } = useQuery({ queryKey: ['admin-settings'], queryFn: getAllSettings })

  const [form, setForm] = useState({
    'appearance.primaryColor': '#6366f1',
    'appearance.logoUrl': '',
    'appearance.faviconUrl': '',
  })

  useEffect(() => {
    if (settings) {
      setForm({
        'appearance.primaryColor': settings['appearance.primaryColor'] || '#6366f1',
        'appearance.logoUrl': settings['appearance.logoUrl'] || '',
        'appearance.faviconUrl': settings['appearance.faviconUrl'] || '',
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
        <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center">
          <Palette size={20} />
        </div>
        <div>
          <h2 className="font-semibold text-text-primary">Appearance</h2>
          <p className="text-xs text-text-muted">Brand colors and visual identity</p>
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <label className="text-sm font-medium text-text-secondary block mb-3">Primary Color</label>
          <div className="flex items-center gap-3 flex-wrap">
            {presetColors.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setForm({ ...form, 'appearance.primaryColor': c.value })}
                className={`w-9 h-9 rounded-xl transition-all duration-200 ${
                  form['appearance.primaryColor'] === c.value
                    ? 'ring-2 ring-white ring-offset-2 ring-offset-bg scale-110'
                    : 'hover:scale-105'
                }`}
                style={{ backgroundColor: c.value }}
                title={c.label}
              />
            ))}
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form['appearance.primaryColor']}
                onChange={(e) => setForm({ ...form, 'appearance.primaryColor': e.target.value })}
                className="w-9 h-9 rounded-xl border border-border cursor-pointer bg-transparent"
              />
              <span className="text-sm text-text-muted font-mono">{form['appearance.primaryColor']}</span>
            </div>
          </div>

          {/* Preview */}
          <div className="mt-4 p-4 bg-bg-elevated rounded-xl border border-border">
            <p className="text-xs text-text-muted mb-2">Preview</p>
            <div className="flex gap-2">
              <button
                className="px-4 py-2 rounded-xl text-sm text-white font-medium"
                style={{ background: `linear-gradient(135deg, ${form['appearance.primaryColor']}, ${form['appearance.primaryColor']}cc)` }}
              >
                Upload
              </button>
              <div
                className="px-4 py-2 rounded-xl text-sm border"
                style={{ borderColor: `${form['appearance.primaryColor']}50`, color: form['appearance.primaryColor'] }}
              >
                Learn more
              </div>
            </div>
          </div>
        </div>

        <Input
          label="Logo URL (optional)"
          placeholder="https://yourdomain.com/logo.png"
          value={form['appearance.logoUrl']}
          onChange={(e) => setForm({ ...form, 'appearance.logoUrl': e.target.value })}
          hint="Replaces the default text logo in the navbar"
        />

        <Input
          label="Favicon URL (optional)"
          placeholder="https://yourdomain.com/favicon.ico"
          value={form['appearance.faviconUrl']}
          onChange={(e) => setForm({ ...form, 'appearance.faviconUrl': e.target.value })}
          hint="Browser tab icon (16×16 or 32×32 px)"
        />
      </div>

      <div className="flex justify-end pt-2 border-t border-border">
        <Button icon={<Save size={15} />} loading={mutation.isPending} onClick={() => mutation.mutate(form)}>
          Save changes
        </Button>
      </div>
    </div>
  )
}
