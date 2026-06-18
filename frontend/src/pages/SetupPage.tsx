import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Shield, Mail, User, Lock, ArrowRight, CheckCircle2, Globe, Wand2 } from 'lucide-react'
import { runSetup } from '@/api/setup'
import { login } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import toast from 'react-hot-toast'

const steps = [
  { icon: <Shield size={20} />, label: 'Welcome', desc: 'First-time setup' },
  { icon: <Globe size={20} />, label: 'Domain', desc: 'Public URL' },
  { icon: <User size={20} />, label: 'Admin account', desc: 'Create credentials' },
  { icon: <CheckCircle2 size={20} />, label: 'Done', desc: 'Ready to go' },
]

export function SetupPage() {
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0)
  const [baseUrl, setBaseUrl] = useState(() => window.location.origin)
  const [urlError, setUrlError] = useState('')
  const [form, setForm] = useState({ email: '', username: '', password: '', confirm: '' })
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validateUrl = () => {
    try {
      const u = new URL(baseUrl)
      if (!['http:', 'https:'].includes(u.protocol)) {
        setUrlError('Must start with http:// or https://')
        return false
      }
      setUrlError('')
      return true
    } catch {
      setUrlError('Please enter a valid URL')
      return false
    }
  }

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.email.includes('@')) e.email = 'Valid email required'
    if (form.username.length < 3) e.username = 'Min. 3 characters'
    if (!/^[a-zA-Z0-9_-]+$/.test(form.username)) e.username = 'Only letters, numbers, - and _'
    if (form.password.length < 8) e.password = 'Min. 8 characters'
    if (form.password !== form.confirm) e.confirm = 'Passwords do not match'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    try {
      const cleanUrl = baseUrl.replace(/\/$/, '')
      await runSetup({ email: form.email, username: form.username, password: form.password, baseUrl: cleanUrl })
      const { token, user } = await login(form.email, form.password)
      setAuth(user, token)
      setStep(3)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Setup failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-gradient-radial from-primary/15 to-transparent rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md"
      >
        {/* Step indicators */}
        <div className="flex items-center gap-0 mb-8">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 ${
                  i < step ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                  i === step ? 'bg-primary/20 text-primary border border-primary/30' :
                  'bg-white/5 text-text-muted border border-border'
                }`}>
                  {i < step ? <CheckCircle2 size={16} /> : s.icon}
                </div>
                <span className={`text-xs ${i === step ? 'text-text-primary' : 'text-text-muted'}`}>
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className={`flex-1 h-px mx-2 mb-4 ${i < step ? 'bg-emerald-500/40' : 'bg-border'}`} />
              )}
            </div>
          ))}
        </div>

        <div className="bg-bg-card border border-border rounded-2xl shadow-card overflow-hidden">

          {/* Step 0: Welcome */}
          {step === 0 && (
            <motion.div key="step0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-primary flex items-center justify-center mx-auto mb-4">
                <Shield size={28} className="text-white" />
              </div>
              <h1 className="text-2xl font-bold text-text-primary">Welcome to ShareDrive</h1>
              <p className="text-text-muted text-sm mt-3 leading-relaxed">
                This is your first time running ShareDrive. Let's get you set up in a few steps.
              </p>
              <div className="mt-6 p-4 bg-primary/5 border border-primary/20 rounded-xl text-left space-y-2">
                {['Configure your domain', 'Create your admin account', 'Manage users & transfers'].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-text-secondary">
                    <CheckCircle2 size={14} className="text-primary flex-shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
              <Button className="w-full mt-6" size="lg" icon={<ArrowRight size={17} />} onClick={() => setStep(1)}>
                Get started
              </Button>
            </motion.div>
          )}

          {/* Step 1: Domain */}
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="p-8">
              <div className="mb-6">
                <h2 className="text-xl font-bold text-text-primary">Domain configuration</h2>
                <p className="text-text-muted text-sm mt-1">
                  Set the public URL of your ShareDrive instance. This is used in download links and emails.
                </p>
              </div>

              <div className="space-y-4">
                <Input
                  label="Base URL"
                  placeholder="https://share.yourdomain.com"
                  value={baseUrl}
                  onChange={(e) => { setBaseUrl(e.target.value); setUrlError('') }}
                  error={urlError}
                  icon={<Globe size={15} />}
                  hint="No trailing slash. Include https:// for production."
                />

                <button
                  type="button"
                  onClick={() => { setBaseUrl(window.location.origin); setUrlError('') }}
                  className="flex items-center gap-2 text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  <Wand2 size={13} />
                  Auto-detect from browser ({window.location.origin})
                </button>

                <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                  <p className="text-xs text-amber-400/80 leading-relaxed">
                    <span className="font-medium text-amber-400">Behind a reverse proxy?</span> Enter your public domain
                    (e.g. <code className="bg-white/5 px-1 rounded">https://share.example.com</code>).
                    No port needed — your proxy handles SSL and forwards to port 80.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <Button variant="secondary" onClick={() => setStep(0)} className="flex-1">
                  Back
                </Button>
                <Button
                  className="flex-1"
                  size="lg"
                  icon={<ArrowRight size={17} />}
                  onClick={() => { if (validateUrl()) setStep(2) }}
                >
                  Continue
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step 2: Create admin */}
          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="p-8">
              <div className="mb-6">
                <h2 className="text-xl font-bold text-text-primary">Create admin account</h2>
                <p className="text-text-muted text-sm mt-1">This will be the primary administrator account.</p>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="Email address"
                  type="email"
                  placeholder="admin@yourdomain.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  error={errors.email}
                  icon={<Mail size={15} />}
                />
                <Input
                  label="Username"
                  placeholder="admin"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  error={errors.username}
                  icon={<User size={15} />}
                />
                <Input
                  label="Password"
                  type="password"
                  placeholder="Min. 8 characters"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  error={errors.password}
                  icon={<Lock size={15} />}
                />
                <Input
                  label="Confirm password"
                  type="password"
                  placeholder="Repeat password"
                  value={form.confirm}
                  onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                  error={errors.confirm}
                  icon={<Lock size={15} />}
                />
                <div className="flex gap-3">
                  <Button variant="secondary" type="button" onClick={() => setStep(1)} className="flex-1">
                    Back
                  </Button>
                  <Button type="submit" className="flex-1" size="lg" loading={loading} icon={<Shield size={17} />}>
                    Create account
                  </Button>
                </div>
              </form>
            </motion.div>
          )}

          {/* Step 3: Success */}
          {step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="p-8 text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, delay: 0.1 }}
                className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4"
              >
                <CheckCircle2 size={32} className="text-emerald-400" />
              </motion.div>
              <h2 className="text-xl font-bold text-text-primary">Setup complete!</h2>
              <p className="text-text-muted text-sm mt-2">
                Your admin account has been created. You're now logged in.
              </p>
              <div className="mt-4 p-3 bg-bg-elevated rounded-xl border border-border text-left">
                <p className="text-xs text-text-muted">Domain configured</p>
                <p className="text-sm text-primary font-mono mt-0.5">{baseUrl.replace(/\/$/, '')}</p>
              </div>
              <Button className="w-full mt-6" size="lg" icon={<ArrowRight size={17} />} onClick={() => navigate('/admin')}>
                Go to admin panel
              </Button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
