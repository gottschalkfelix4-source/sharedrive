import { useState } from 'react'
import { ArrowRight, CheckCircle2, Globe, Lock, Mail, Shield, User } from 'lucide-react'
import { runSetup } from '@/api/setup'
import { login } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { getPasswordError, PASSWORD_HINT } from '@/lib/utils'
import toast from 'react-hot-toast'

export function SetupPage() {
  const [setupToken, setSetupToken] = useState(
    () => sessionStorage.getItem('setup-token') || ''
  )
  const [baseUrl, setBaseUrl] = useState(() => window.location.origin)
  const [form, setForm] = useState({ email: '', username: '', password: '', confirm: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [signedIn, setSignedIn] = useState(false)
  const { setAuth } = useAuthStore()

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const nextErrors: Record<string, string> = {}
    if (!setupToken.trim()) nextErrors.setupToken = 'Setup-Token erforderlich'
    try {
      const url = new URL(baseUrl.trim())
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
          url.search || url.hash || url.pathname !== '/') {
        nextErrors.baseUrl = 'HTTP- oder HTTPS-URL ohne Pfad oder Zugangsdaten eingeben'
      }
    } catch {
      nextErrors.baseUrl = 'Gültige URL erforderlich'
    }
    if (!form.email.trim().includes('@')) nextErrors.email = 'Gültige E-Mail erforderlich'
    if (!/^[a-zA-Z0-9_-]{3,32}$/.test(form.username))
      nextErrors.username = '3 bis 32 Buchstaben, Zahlen, - oder _'
    const passwordError = getPasswordError(form.password)
    if (passwordError) nextErrors.password = passwordError
    if (form.password !== form.confirm) nextErrors.confirm = 'Passwörter stimmen nicht überein'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    setLoading(true)
    sessionStorage.setItem('setup-token', setupToken.trim())
    try {
      await runSetup({
        email: form.email.trim(),
        username: form.username,
        password: form.password,
        baseUrl: new URL(baseUrl.trim()).origin,
      })
      sessionStorage.removeItem('setup-token')
      setCompleted(true)
      try {
        const { token, user } = await login(form.email.trim(), form.password)
        if (token && user) {
          setAuth(user, token)
          setSignedIn(true)
        }
      } catch {
        toast.error('Konto erstellt. Bitte melde dich an.')
      }
      setForm((current) => ({ ...current, password: '', confirm: '' }))
      setSetupToken('')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Einrichtung fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen px-4 py-10 flex items-center justify-center">
      <div className="w-full max-w-lg">
        {completed ? (
          <div className="space-y-5">
            <CheckCircle2 size={28} className="text-emerald-400" />
            <h1 className="text-2xl font-bold text-text-primary">Einrichtung abgeschlossen</h1>
            <p className="text-text-secondary">Dein Admin-Konto wurde erstellt.</p>
            <p className="text-sm text-text-muted break-all">{baseUrl.trim().replace(/\/$/, '')}</p>
            <Button
              className="rounded-lg shadow-none bg-primary bg-none"
              icon={<ArrowRight size={16} />}
              onClick={() => window.location.assign(signedIn ? '/admin' : '/login')}
            >
              {signedIn ? 'Zum Admin-Bereich' : 'Zur Anmeldung'}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-6">
              <Shield size={24} className="text-primary" />
              <h1 className="text-2xl font-bold text-text-primary">ShareDrive einrichten</h1>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Einmaliges Setup-Token"
                type="password"
                autoComplete="off"
                value={setupToken}
                onChange={(event) => setSetupToken(event.target.value)}
                error={errors.setupToken}
                className="rounded-lg"
                icon={<Lock size={16} />}
              />
              <Input
                label="Öffentliche URL"
                type="url"
                placeholder="https://share.example.com"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                error={errors.baseUrl}
                className="rounded-lg"
                icon={<Globe size={16} />}
              />
              <fieldset className="border-t border-border pt-5 space-y-4 min-w-0">
                <legend className="text-base font-medium text-text-primary pr-3">Admin-Konto</legend>
                <Input label="E-Mail-Adresse" type="email" autoComplete="email"
                  value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })}
                  error={errors.email} className="rounded-lg" icon={<Mail size={16} />} />
                <Input label="Benutzername" autoComplete="username"
                  value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })}
                  error={errors.username} className="rounded-lg" icon={<User size={16} />} />
                <Input label="Passwort" type="password" autoComplete="new-password"
                  value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })}
                  error={errors.password} hint={PASSWORD_HINT} className="rounded-lg" icon={<Lock size={16} />} />
                <Input label="Passwort bestätigen" type="password" autoComplete="new-password"
                  value={form.confirm} onChange={(event) => setForm({ ...form, confirm: event.target.value })}
                  error={errors.confirm} className="rounded-lg" icon={<Lock size={16} />} />
              </fieldset>
              <Button type="submit" loading={loading} icon={<ArrowRight size={16} />}
                className="w-full rounded-lg shadow-none bg-primary bg-none">
                Einrichtung abschließen
              </Button>
            </form>
          </>
        )}
      </div>
    </main>
  )
}
