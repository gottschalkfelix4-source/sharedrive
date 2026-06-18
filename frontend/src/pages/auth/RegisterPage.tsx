import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, Lock, User, Upload, UserPlus, CheckCircle } from 'lucide-react'
import { register } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import toast from 'react-hot-toast'

export function RegisterPage() {
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()
  const [form, setForm] = useState({ email: '', username: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [verificationSent, setVerificationSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.password.length < 8) {
      toast.error('Passwort muss mindestens 8 Zeichen lang sein')
      return
    }
    setLoading(true)
    try {
      const result = await register(form.email, form.username, form.password)
      if (result.needsVerification) {
        setVerificationSent(true)
      } else if (result.token && result.user) {
        setAuth(result.user, result.token)
        toast.success(`Willkommen, ${result.user.username}!`)
        navigate('/dashboard')
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Registrierung fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  if (verificationSent) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-sm text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={32} className="text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary mb-2">E-Mail prüfen</h1>
          <p className="text-text-muted text-sm mb-6">
            Wir haben einen Bestätigungslink an <span className="text-text-primary font-medium">{form.email}</span> gesendet.
            Klicke den Link in der E-Mail, um dein Konto zu aktivieren.
          </p>
          <div className="bg-bg-card border border-border rounded-2xl p-4 text-left space-y-2">
            <p className="text-xs text-text-muted">Keine E-Mail erhalten?</p>
            <ul className="text-xs text-text-muted list-disc list-inside space-y-1">
              <li>Spam-Ordner prüfen</li>
              <li>Sicherstellen, dass die E-Mail-Adresse korrekt ist</li>
              <li>Der Link läuft nach 24 Stunden ab</li>
            </ul>
          </div>
          <p className="text-center text-sm text-text-muted mt-6">
            <Link to="/login" className="text-primary hover:underline">Zurück zur Anmeldung</Link>
          </p>
        </motion.div>
      </div>
    )
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
          <h1 className="text-2xl font-bold text-text-primary">Konto erstellen</h1>
          <p className="text-text-muted text-sm mt-1">Transfer-Verlauf & mehr</p>
        </div>

        <div className="bg-bg-card border border-border rounded-2xl p-6 shadow-card">
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
            <Input
              label="Benutzername"
              placeholder="cooluser"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              icon={<User size={15} />}
              hint="3–32 Zeichen, Buchstaben, Zahlen, - und _"
              required
            />
            <Input
              label="Passwort"
              type="password"
              placeholder="Mind. 8 Zeichen"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              icon={<Lock size={15} />}
              required
            />
            <Button type="submit" className="w-full" size="lg" loading={loading} icon={<UserPlus size={17} />}>
              Konto erstellen
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-text-muted mt-4">
          Bereits ein Konto?{' '}
          <Link to="/login" className="text-primary hover:underline">
            Anmelden
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
