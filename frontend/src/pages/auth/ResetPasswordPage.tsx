import { useState } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Lock, KeyRound, XCircle } from 'lucide-react'
import { resetPassword } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { getPasswordError, PASSWORD_HINT } from '@/lib/utils'
import toast from 'react-hot-toast'

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()
  const token = searchParams.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-sm text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
            <XCircle size={32} className="text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary mb-2">Link ungültig</h1>
          <p className="text-text-muted text-sm mb-6">Dieser Link zum Zurücksetzen des Passworts ist unvollständig.</p>
          <Link to="/forgot-password" className="text-primary hover:underline text-sm">Neuen Link anfordern</Link>
        </motion.div>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const passwordError = getPasswordError(password)
    if (passwordError) {
      toast.error(passwordError)
      return
    }
    if (password !== confirm) {
      toast.error('Passwörter stimmen nicht überein')
      return
    }
    setLoading(true)
    try {
      const { token: jwt, user } = await resetPassword(token, password)
      setAuth(user, jwt)
      toast.success('Passwort wurde geändert')
      navigate('/dashboard')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Link ist ungültig oder abgelaufen')
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
            <KeyRound size={22} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary">Neues Passwort</h1>
          <p className="text-text-muted text-sm mt-1">Wähle ein neues Passwort für dein Konto</p>
        </div>

        <div className="bg-bg-card border border-border rounded-2xl p-6 shadow-card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Neues Passwort"
              type="password"
              placeholder="Neues Passwort"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              icon={<Lock size={15} />}
              hint={PASSWORD_HINT}
              required
            />
            <Input
              label="Passwort bestätigen"
              type="password"
              placeholder="Passwort wiederholen"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              icon={<Lock size={15} />}
              required
            />
            <Button type="submit" className="w-full" size="lg" loading={loading} icon={<KeyRound size={17} />}>
              Passwort ändern
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  )
}
