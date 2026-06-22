import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, Lock, Upload, LogIn, KeyRound, ArrowLeft } from 'lucide-react'
import { login, loginTwoFactor } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import toast from 'react-hot-toast'

export function LoginPage() {
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()
  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [challengeToken, setChallengeToken] = useState<string | null>(null)
  const [code, setCode] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const result = await login(form.email, form.password)
      if (result.requiresTwoFactor && result.challengeToken) {
        setChallengeToken(result.challengeToken)
      } else if (result.token && result.user) {
        setAuth(result.user, result.token)
        toast.success(`Willkommen zurück, ${result.user.username}!`)
        navigate(result.user.role === 'ADMIN' ? '/admin' : '/dashboard')
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Anmeldung fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  const handleTwoFactorSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!challengeToken) return
    setLoading(true)
    try {
      const { token, user } = await loginTwoFactor(challengeToken, code)
      setAuth(user, token)
      toast.success(`Willkommen zurück, ${user.username}!`)
      navigate(user.role === 'ADMIN' ? '/admin' : '/dashboard')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Code ungültig')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-gradient-radial from-primary/10 to-transparent rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-sm"
      >
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center mx-auto mb-4">
            <Upload size={22} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary">
            {challengeToken ? 'Zwei-Faktor-Code' : 'Willkommen zurück'}
          </h1>
          <p className="text-text-muted text-sm mt-1">
            {challengeToken ? 'Gib den Code aus deiner Authenticator-App ein' : 'In dein Konto einloggen'}
          </p>
        </div>

        <div className="bg-bg-card border border-border rounded-2xl p-6 shadow-card">
          {challengeToken ? (
            <form onSubmit={handleTwoFactorSubmit} className="space-y-4">
              <Input
                label="Code"
                placeholder="123456 oder Backup-Code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                icon={<KeyRound size={15} />}
                autoFocus
                required
              />
              <Button type="submit" className="w-full" size="lg" loading={loading} icon={<LogIn size={17} />}>
                Bestätigen
              </Button>
              <button
                type="button"
                onClick={() => {
                  setChallengeToken(null)
                  setCode('')
                }}
                className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary mx-auto"
              >
                <ArrowLeft size={14} /> Zurück
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="E-Mail"
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                icon={<Mail size={15} />}
                required
              />
              <div>
                <Input
                  label="Passwort"
                  type="password"
                  placeholder="Dein Passwort"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  icon={<Lock size={15} />}
                  required
                />
                <Link to="/forgot-password" className="text-xs text-primary hover:underline mt-1.5 inline-block">
                  Passwort vergessen?
                </Link>
              </div>
              <Button type="submit" className="w-full" size="lg" loading={loading} icon={<LogIn size={17} />}>
                Anmelden
              </Button>
            </form>
          )}
        </div>

        <p className="text-center text-sm text-text-muted mt-4">
          Noch kein Konto?{' '}
          <Link to="/register" className="text-primary hover:underline">
            Registrieren
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
