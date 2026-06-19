import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, Upload, CheckCircle, Send } from 'lucide-react'
import { forgotPassword } from '@/api/auth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import toast from 'react-hot-toast'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await forgotPassword(email)
      setSent(true)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Etwas ist schiefgelaufen')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
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
            Falls ein Konto mit <span className="text-text-primary font-medium">{email}</span> existiert, haben wir
            einen Link zum Zurücksetzen des Passworts gesendet. Der Link läuft nach 1 Stunde ab.
          </p>
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
          <h1 className="text-2xl font-bold text-text-primary">Passwort vergessen?</h1>
          <p className="text-text-muted text-sm mt-1">Wir senden dir einen Link zum Zurücksetzen</p>
        </div>

        <div className="bg-bg-card border border-border rounded-2xl p-6 shadow-card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="E-Mail"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              icon={<Mail size={15} />}
              required
            />
            <Button type="submit" className="w-full" size="lg" loading={loading} icon={<Send size={17} />}>
              Link senden
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-text-muted mt-4">
          <Link to="/login" className="text-primary hover:underline">Zurück zur Anmeldung</Link>
        </p>
      </motion.div>
    </div>
  )
}
