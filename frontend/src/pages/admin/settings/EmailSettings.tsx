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
      toast.error('Zuerst SMTP-Benutzer oder Absenderadresse eingeben')
      return
    }
    setTestLoading(true)
    try {
      await testEmail(to)
      toast.success(`Test-E-Mail an ${to} gesendet`)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'E-Mail-Test fehlgeschlagen')
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
    onSuccess: () => toast.success('Einstellungen gespeichert'),
    onError: () => toast.error('Speichern fehlgeschlagen'),
  })

  if (isLoading) return <div className="flex justify-center py-8"><Spinner /></div>

  return (
    <div className="bg-bg-card border border-border rounded-2xl p-6 space-y-6">
      <div className="flex items-center gap-3 pb-4 border-b border-border">
        <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center">
          <Mail size={20} />
        </div>
        <div>
          <h2 className="font-semibold text-text-primary">E-Mail-Konfiguration</h2>
          <p className="text-xs text-text-muted">SMTP-Einstellungen für Download-Benachrichtigungen</p>
        </div>
      </div>

      <Toggle
        checked={form['email.enabled']}
        onChange={(v) => setForm({ ...form, 'email.enabled': v })}
        label="E-Mail-Benachrichtigungen aktivieren"
        description="E-Mail senden, wenn Transfers heruntergeladen werden"
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
          label="SSL/TLS verwenden (Port 465)"
          description="Für SSL-Verschlüsselung aktivieren (kein STARTTLS)"
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="SMTP-Benutzer"
            placeholder="user@gmail.com"
            value={form['email.user']}
            onChange={(e) => setForm({ ...form, 'email.user': e.target.value })}
          />
          <Input
            label="SMTP-Passwort"
            type="password"
            placeholder={settings?.['email.password']?.includes('•') ? 'Passwort gespeichert (versteckt)' : 'Passwort eingeben'}
            value={form['email.password']}
            onChange={(e) => setForm({ ...form, 'email.password': e.target.value })}
          />
        </div>

        <Input
          label="Absenderadresse"
          type="email"
          placeholder="noreply@yourdomain.com"
          value={form['email.from']}
          onChange={(e) => setForm({ ...form, 'email.from': e.target.value })}
          hint="Absenderadresse im E-Mail-Programm"
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
          Test-E-Mail senden
        </Button>
        <Button icon={<Save size={15} />} loading={mutation.isPending} onClick={() => mutation.mutate(form)}>
          Änderungen speichern
        </Button>
      </div>
    </div>
  )
}
