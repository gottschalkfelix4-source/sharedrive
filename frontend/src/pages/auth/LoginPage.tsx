import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, Lock, Upload, LogIn } from 'lucide-react'
import { login } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import toast from 'react-hot-toast'

export function LoginPage() {
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()
  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const { token, user } = await login(form.email, form.password)
      setAuth(user, token)
      toast.success(`Willkommen zurück, ${user.username}!`)
      navigate(user.role === 'ADMIN' ? '/admin' : '/dashboard')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Anmeldung fehlgeschlagen')
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
          <h1 className="text-2xl font-bold text-text-primary">Willkommen zurück</h1>
          <p className="text-text-muted text-sm mt-1">In dein Konto einloggen</p>
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
              label="Passwort"
              type="password"
              placeholder="Dein Passwort"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              icon={<Lock size={15} />}
              required
            />
            <Button type="submit" className="w-full" size="lg" loading={loading} icon={<LogIn size={17} />}>
              Anmelden
            </Button>
          </form>
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
