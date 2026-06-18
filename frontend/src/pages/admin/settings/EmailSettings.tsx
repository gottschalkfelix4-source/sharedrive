import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Save, Mail, TestTube } from 'lucide-react'
import { getAllSettings, updateSettings, testEmail } from '@/api/settings'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Toggle } from '@/components/ui/Toggle'
import { Spinner } from '@/components/ui/Spinner'
import toast from 'react-hot-toast'

export function EmailSettings() {
  const { data: settings, isLoading } = useQuery({ queryKey: ['admin-settings'], queryFn: getAllSettings })

  const [testLoading, setTestLoading] = useState(false)

  const handleTestEmail = async () => {
    const to = form['email.user'] || form['email.from']
    if (!to) {
      toast.error('Enter an SMTP user or from address first')
      return
    }
    setTestLoading(true)
    try {
      await testEmail(to)
      toast.success(`Test email sent to ${to}`)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Email test failed')
    } finally {
      setTestLoading(false)
    }
  }

  const [form, setForm] = useState({
    'email.enabled': false,
    'email.host': '',
    'email.port': '587',
    'email.secure': false,
    'email.user': '',
    'email.password': '',
    'email.from': '',
  })

  useEffect(() => {
    if (settings) {
      setForm({
        'email.enabled': settings['email.enabled'] === 'true',
        'email.host': settings['email.host'] || '',
        'email.port': settings['email.port'] || '587',
        'email.secure': settings['email.secure'] === 'true',
        'email.user': settings['email.user'] || '',
        'email.password': settings['email.password']?.includes('•') ? '' : settings['email.password'] || '',
        'email.from': settings['email.from'] || '',
      })
    }
  }, [settings])

  const mutation = useMutation({
    mutationFn: (f: typeof form) =>
      updateSettings({
        'email.enabled': String(f['email.enabled']),
        'email.host': f['email.host'],
        'email.port': f['email.port'],
        'email.secure': String(f['email.secure']),
        'email.user': f['email.user'],
        ...(f['email.password'] ? { 'email.password': f['email.password'] } : {}),
        'email.from': f['email.from'],
      }),
    onSuccess: () => toast.success('Settings saved'),
    onError: () => toast.error('Failed to save'),
  })

  if (isLoading) return <div className="flex justify-center py-8"><Spinner /></div>

  return (
    <div className="bg-bg-card border border-border rounded-2xl p-6 space-y-6">
      <div className="flex items-center gap-3 pb-4 border-b border-border">
        <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center">
          <Mail size={20} />
        </div>
        <div>
          <h2 className="font-semibold text-text-primary">Email Configuration</h2>
          <p className="text-xs text-text-muted">SMTP settings for download notifications</p>
        </div>
      </div>

      <Toggle
        checked={form['email.enabled']}
        onChange={(v) => setForm({ ...form, 'email.enabled': v })}
        label="Enable email notifications"
        description="Send emails when transfers are downloaded"
      />

      <div className={`space-y-4 transition-opacity ${form['email.enabled'] ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <Input
              label="SMTP Host"
              placeholder="smtp.gmail.com"
              value={form['email.host']}
              onChange={(e) => setForm({ ...form, 'email.host': e.target.value })}
            />
          </div>
          <Input
            label="Port"
            type="number"
            value={form['email.port']}
            onChange={(e) => setForm({ ...form, 'email.port': e.target.value })}
          />
        </div>

        <Toggle
          checked={form['email.secure']}
          onChange={(v) => setForm({ ...form, 'email.secure': v })}
          label="Use SSL/TLS (port 465)"
          description="Enable for SSL encryption (not STARTTLS)"
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="SMTP User"
            placeholder="user@gmail.com"
            value={form['email.user']}
            onChange={(e) => setForm({ ...form, 'email.user': e.target.value })}
          />
          <Input
            label="SMTP Password"
            type="password"
            placeholder={settings?.['email.password']?.includes('•') ? 'Password saved (hidden)' : 'Enter password'}
            value={form['email.password']}
            onChange={(e) => setForm({ ...form, 'email.password': e.target.value })}
          />
        </div>

        <Input
          label="From address"
          type="email"
          placeholder="noreply@yourdomain.com"
          value={form['email.from']}
          onChange={(e) => setForm({ ...form, 'email.from': e.target.value })}
          hint="Sender address shown in email client"
        />
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border">
        <Button
          variant="secondary"
          icon={<TestTube size={15} />}
          loading={testLoading}
          onClick={handleTestEmail}
          disabled={!form['email.enabled']}
        >
          Send test email
        </Button>
        <Button icon={<Save size={15} />} loading={mutation.isPending} onClick={() => mutation.mutate(form)}>
          Save changes
        </Button>
      </div>
    </div>
  )
}
