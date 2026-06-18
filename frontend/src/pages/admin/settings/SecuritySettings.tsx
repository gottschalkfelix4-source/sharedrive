import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Save, Lock } from 'lucide-react'
import { getAllSettings, updateSettings } from '@/api/settings'
import { Button } from '@/components/ui/Button'
import { Toggle } from '@/components/ui/Toggle'
import { Spinner } from '@/components/ui/Spinner'
import toast from 'react-hot-toast'

export function SecuritySettings() {
  const { data: settings, isLoading } = useQuery({ queryKey: ['admin-settings'], queryFn: getAllSettings })

  const [form, setForm] = useState({
    registrationEnabled: true,
    requireEmailVerification: false,
  })

  useEffect(() => {
    if (settings) {
      setForm({
        registrationEnabled: settings['security.registrationEnabled'] !== 'false',
        requireEmailVerification: settings['security.requireEmailVerification'] === 'true',
      })
    }
  }, [settings])

  const mutation = useMutation({
    mutationFn: (f: typeof form) =>
      updateSettings({
        'security.registrationEnabled': String(f.registrationEnabled),
        'security.requireEmailVerification': String(f.requireEmailVerification),
      }),
    onSuccess: () => toast.success('Settings saved'),
    onError: () => toast.error('Failed to save'),
  })

  if (isLoading) return <div className="flex justify-center py-8"><Spinner /></div>

  return (
    <div className="bg-bg-card border border-border rounded-2xl p-6 space-y-6">
      <div className="flex items-center gap-3 pb-4 border-b border-border">
        <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
          <Lock size={20} />
        </div>
        <div>
          <h2 className="font-semibold text-text-primary">Security & Access</h2>
          <p className="text-xs text-text-muted">Registration and access control</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="p-4 bg-bg-elevated rounded-xl border border-border">
          <Toggle
            checked={form.registrationEnabled}
            onChange={(v) => setForm({ ...form, registrationEnabled: v })}
            label="Allow registration"
            description="Let new users create accounts. Disable to make the platform invite-only."
          />
        </div>

        <div className="p-4 bg-bg-elevated rounded-xl border border-border">
          <Toggle
            checked={form.requireEmailVerification}
            onChange={(v) => setForm({ ...form, requireEmailVerification: v })}
            label="Require email verification"
            description="Users must verify their email address before accessing the platform."
          />
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
