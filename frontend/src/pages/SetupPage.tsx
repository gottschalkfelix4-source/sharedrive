import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Shield, Mail, User, Lock, ArrowRight, CheckCircle2, Globe,
  KeyRound, ShieldCheck, Copy, Eye, EyeOff, Database, Server,
} from 'lucide-react'
import { runSetup, getSetupEnv, applySSL, type SetupEnv } from '@/api/setup'
import { login } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Toggle } from '@/components/ui/Toggle'
import { Spinner } from '@/components/ui/Spinner'
import toast from 'react-hot-toast'

const steps = [
  { icon: <Shield size={20} />,    label: 'Willkommen',    desc: 'Ersteinrichtung' },
  { icon: <KeyRound size={20} />,  label: 'Zugangsdaten',  desc: 'Generierte Credentials' },
  { icon: <Globe size={20} />,     label: 'Domain & SSL',  desc: 'Öffentliche URL' },
  { icon: <User size={20} />,      label: 'Admin-Konto',   desc: 'Zugangsdaten erstellen' },
  { icon: <CheckCircle2 size={20} />, label: 'Fertig',     desc: 'Bereit' },
]

function CopyField({ label, value, icon, secret }: { label: string; value: string; icon: React.ReactNode; secret?: boolean }) {
  const [revealed, setRevealed] = useState(false)
  const copy = () => { navigator.clipboard.writeText(value); toast.success(`${label} kopiert`) }
  const display = secret && !revealed ? '•'.repeat(Math.min(value.length, 24)) : value

  return (
    <div className="space-y-1">
      <p className="text-xs text-text-muted flex items-center gap-1.5">{icon}{label}</p>
      <div className="flex items-center gap-2 bg-bg rounded-xl border border-border px-3 py-2">
        <span className="flex-1 font-mono text-xs text-text-secondary break-all leading-relaxed">
          {display}
        </span>
        {secret && (
          <button onClick={() => setRevealed(v => !v)} className="text-text-muted hover:text-text-primary transition-colors flex-shrink-0">
            {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        )}
        <button onClick={copy} className="text-text-muted hover:text-text-primary transition-colors flex-shrink-0">
          <Copy size={13} />
        </button>
      </div>
    </div>
  )
}

export function SetupPage() {
  const navigate  = useNavigate()
  const { setAuth } = useAuthStore()
  const [step, setStep] = useState<0 | 1 | 2 | 3 | 4>(0)

  // Step 1 — credentials
  const [env, setEnv]           = useState<SetupEnv | null>(null)
  const [envLoading, setEnvLoading] = useState(false)

  // Step 2 — domain / SSL
  const [baseUrl, setBaseUrl]   = useState(() => window.location.origin)
  const [urlError, setUrlError] = useState('')
  const [sslEnabled, setSslEnabled]   = useState(false)
  const [sslDomain, setSslDomain]     = useState('')
  const [sslDomainErr, setSslDomainErr] = useState('')
  const [acmeEmail, setAcmeEmail]     = useState('')
  const [sslApplying, setSslApplying] = useState(false)
  const [sslApplied, setSslApplied]   = useState(false)

  // Step 3 — admin account
  const [form, setForm]   = useState({ email: '', username: '', password: '', confirm: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  // Auto-extract domain from baseUrl when user types
  useEffect(() => {
    try {
      const u = new URL(baseUrl)
      if (u.hostname && u.hostname !== 'localhost') setSslDomain(u.hostname)
    } catch {}
  }, [baseUrl])

  const loadEnv = async () => {
    setEnvLoading(true)
    try {
      setEnv(await getSetupEnv())
    } catch {
      toast.error('Zugangsdaten konnten nicht geladen werden')
    } finally {
      setEnvLoading(false)
    }
  }

  const goToStep1 = () => { setStep(1); loadEnv() }

  const validateUrl = () => {
    try {
      const u = new URL(baseUrl)
      if (!['http:', 'https:'].includes(u.protocol)) {
        setUrlError('Muss mit http:// oder https:// beginnen'); return false
      }
      setUrlError(''); return true
    } catch {
      setUrlError('Bitte eine gültige URL eingeben'); return false
    }
  }

  const handleApplySSL = async () => {
    if (!sslDomain.trim()) { setSslDomainErr('Domain eingeben'); return }
    setSslDomainErr('')
    setSslApplying(true)
    try {
      const res = await applySSL(sslDomain.trim(), acmeEmail.trim())
      setBaseUrl(res.baseUrl)
      setSslApplied(true)
      toast.success('SSL aktiviert — Zertifikat wird jetzt ausgestellt')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'SSL konnte nicht aktiviert werden')
    } finally {
      setSslApplying(false)
    }
  }

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.email.includes('@')) e.email = 'Gültige E-Mail erforderlich'
    if (form.username.length < 3) e.username = 'Mind. 3 Zeichen'
    if (!/^[a-zA-Z0-9_-]+$/.test(form.username)) e.username = 'Nur Buchstaben, Zahlen, - und _'
    if (form.password.length < 8) e.password = 'Mind. 8 Zeichen'
    if (form.password !== form.confirm) e.confirm = 'Passwörter stimmen nicht überein'
    setErrors(e); return Object.keys(e).length === 0
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
      setStep(4)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Einrichtung fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  const copyAllCredentials = () => {
    if (!env) return
    const text = [
      `# ShareDrive Zugangsdaten`,
      `POSTGRES_USER=${env.dbUser}`,
      `POSTGRES_PASSWORD=${env.dbPassword}`,
      `POSTGRES_DB=${env.dbName}`,
      `MINIO_ROOT_USER=${env.minioUser}`,
      `MINIO_ROOT_PASSWORD=${env.minioPassword}`,
      `JWT_SECRET=${env.jwtSecret}`,
    ].join('\n')
    navigator.clipboard.writeText(text)
    toast.success('Alle Zugangsdaten kopiert')
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-gradient-radial from-primary/15 to-transparent rounded-full blur-3xl" />
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-md">

        {/* Step indicators */}
        <div className="flex items-center gap-0 mb-8">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 ${
                  i < step  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                  i === step ? 'bg-primary/20 text-primary border border-primary/30' :
                               'bg-white/5 text-text-muted border border-border'
                }`}>
                  {i < step ? <CheckCircle2 size={16} /> : s.icon}
                </div>
                <span className={`text-xs ${i === step ? 'text-text-primary' : 'text-text-muted'}`}>{s.label}</span>
              </div>
              {i < steps.length - 1 && (
                <div className={`flex-1 h-px mx-2 mb-4 ${i < step ? 'bg-emerald-500/40' : 'bg-border'}`} />
              )}
            </div>
          ))}
        </div>

        <div className="bg-bg-card border border-border rounded-2xl shadow-card overflow-hidden">

          {/* ── Step 0: Welcome ── */}
          <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div key="s0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-primary flex items-center justify-center mx-auto mb-4">
                <Shield size={28} className="text-white" />
              </div>
              <h1 className="text-2xl font-bold text-text-primary">Willkommen bei ShareDrive</h1>
              <p className="text-text-muted text-sm mt-3 leading-relaxed">
                ShareDrive wird zum ersten Mal gestartet. Richte es in wenigen Schritten ein — ohne manuelle Konfigurationsdateien.
              </p>
              <div className="mt-6 p-4 bg-primary/5 border border-primary/20 rounded-xl text-left space-y-2">
                {[
                  'Zugangsdaten sichern (auto-generiert)',
                  'Domain konfigurieren & SSL aktivieren',
                  'Admin-Konto erstellen',
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-text-secondary">
                    <CheckCircle2 size={14} className="text-primary flex-shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
              <Button className="w-full mt-6" size="lg" icon={<ArrowRight size={17} />} onClick={goToStep1}>
                Loslegen
              </Button>
            </motion.div>
          )}

          {/* ── Step 1: Credentials ── */}
          {step === 1 && (
            <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="p-8">
              <div className="mb-5">
                <h2 className="text-xl font-bold text-text-primary">Zugangsdaten</h2>
                <p className="text-text-muted text-sm mt-1">
                  Diese Zugangsdaten wurden automatisch generiert. Sichere sie jetzt — sie können später nicht mehr hier eingesehen werden.
                </p>
              </div>

              {envLoading || !env ? (
                <div className="flex items-center justify-center py-12">
                  <Spinner size="lg" />
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs font-medium text-text-secondary flex items-center gap-1.5">
                    <Database size={12} /> Datenbank
                  </p>
                  <CopyField label="Benutzer"  value={env.dbUser}     icon={<User size={11} />} />
                  <CopyField label="Datenbank" value={env.dbName}     icon={<Database size={11} />} />
                  <CopyField label="Passwort"  value={env.dbPassword} icon={<Lock size={11} />} secret />

                  <p className="text-xs font-medium text-text-secondary flex items-center gap-1.5 pt-1">
                    <Server size={12} /> MinIO (Objektspeicher)
                  </p>
                  <CopyField label="Benutzer" value={env.minioUser}     icon={<User size={11} />} />
                  <CopyField label="Passwort" value={env.minioPassword} icon={<Lock size={11} />} secret />

                  <p className="text-xs font-medium text-text-secondary flex items-center gap-1.5 pt-1">
                    <Shield size={12} /> Sicherheit
                  </p>
                  <CopyField label="JWT Secret" value={env.jwtSecret} icon={<KeyRound size={11} />} secret />

                  <button
                    onClick={copyAllCredentials}
                    className="w-full mt-1 flex items-center justify-center gap-2 text-xs text-primary hover:text-primary/80 border border-primary/30 hover:border-primary/50 rounded-xl py-2.5 transition-colors"
                  >
                    <Copy size={12} /> Alle Zugangsdaten kopieren
                  </button>

                  <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                    <p className="text-xs text-amber-400/80 leading-relaxed">
                      <span className="font-medium text-amber-400">Wichtig:</span> Diese Zugangsdaten sind in der <code className="bg-white/5 px-1 rounded">.env</code>-Datei auf deinem Server gespeichert. Sichere sie an einem sicheren Ort.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex gap-3 mt-5">
                <Button variant="secondary" onClick={() => setStep(0)} className="flex-1">Zurück</Button>
                <Button className="flex-1" size="lg" icon={<ArrowRight size={17} />} onClick={() => setStep(2)} disabled={!env}>
                  Gesichert & weiter
                </Button>
              </div>
            </motion.div>
          )}

          {/* ── Step 2: Domain & SSL ── */}
          {step === 2 && (
            <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="p-8">
              <div className="mb-5">
                <h2 className="text-xl font-bold text-text-primary">Domain & SSL</h2>
                <p className="text-text-muted text-sm mt-1">
                  Öffentliche URL festlegen. Optional: kostenloses HTTPS direkt aktivieren.
                </p>
              </div>

              <div className="space-y-4">
                <Input
                  label="Basis-URL"
                  placeholder="https://share.yourdomain.com"
                  value={baseUrl}
                  onChange={(e) => { setBaseUrl(e.target.value); setUrlError('') }}
                  error={urlError}
                  icon={<Globe size={15} />}
                  hint="Wird in Download-Links und E-Mails verwendet."
                />

                {/* SSL section */}
                <div className="border border-border rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between gap-4 px-4 py-3 bg-bg-elevated">
                    <div>
                      <p className="text-sm font-medium text-text-primary flex items-center gap-1.5">
                        <ShieldCheck size={14} className="text-violet-400" />
                        Automatisches HTTPS (Let's Encrypt)
                      </p>
                      <p className="text-xs text-text-muted mt-0.5">Kostenlos, automatisch erneuert — kein Reverse Proxy nötig</p>
                    </div>
                    <Toggle
                      checked={sslEnabled}
                      onChange={(v) => {
                        setSslEnabled(v)
                        setSslApplied(false)
                        if (v) {
                          try { setSslDomain(new URL(baseUrl).hostname) } catch {}
                        }
                      }}
                    />
                  </div>

                  {sslEnabled && (
                    <div className="px-4 pb-4 pt-3 border-t border-border space-y-3">
                      <Input
                        label="Domain"
                        placeholder="share.yourdomain.com"
                        value={sslDomain}
                        onChange={(e) => { setSslDomain(e.target.value); setSslDomainErr('') }}
                        error={sslDomainErr}
                        icon={<Globe size={15} />}
                        hint="Muss auf die IP dieses Servers zeigen (A-Record gesetzt)."
                      />
                      <Input
                        label="E-Mail für Let's Encrypt (optional)"
                        type="email"
                        placeholder="admin@yourdomain.com"
                        value={acmeEmail}
                        onChange={(e) => setAcmeEmail(e.target.value)}
                        icon={<Mail size={15} />}
                      />

                      {sslApplied ? (
                        <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
                          <CheckCircle2 size={15} />
                          SSL aktiviert — Zertifikat wird ausgestellt
                        </div>
                      ) : (
                        <Button
                          variant="secondary"
                          className="w-full"
                          icon={<ShieldCheck size={15} />}
                          loading={sslApplying}
                          onClick={handleApplySSL}
                        >
                          SSL jetzt aktivieren
                        </Button>
                      )}

                      <div className="p-3 bg-violet-500/5 border border-violet-500/20 rounded-xl space-y-1">
                        <p className="text-xs font-medium text-violet-300">Voraussetzungen</p>
                        {[
                          'Domain-A-Record zeigt auf diese Server-IP',
                          'Ports 80 und 443 am VPS geöffnet',
                        ].map((r, i) => (
                          <div key={i} className="flex items-center gap-1.5 text-xs text-text-muted">
                            <CheckCircle2 size={10} className="text-violet-400 flex-shrink-0" />
                            {r}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3 mt-5">
                <Button variant="secondary" onClick={() => setStep(1)} className="flex-1">Zurück</Button>
                <Button
                  className="flex-1"
                  size="lg"
                  icon={<ArrowRight size={17} />}
                  onClick={() => { if (validateUrl()) setStep(3) }}
                >
                  Weiter
                </Button>
              </div>
            </motion.div>
          )}

          {/* ── Step 3: Admin account ── */}
          {step === 3 && (
            <motion.div key="s3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="p-8">
              <div className="mb-5">
                <h2 className="text-xl font-bold text-text-primary">Admin-Konto erstellen</h2>
                <p className="text-text-muted text-sm mt-1">Dies wird das primäre Administratorkonto.</p>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input label="E-Mail-Adresse" type="email" placeholder="admin@yourdomain.com"
                  value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                  error={errors.email} icon={<Mail size={15} />} />
                <Input label="Benutzername" placeholder="admin"
                  value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}
                  error={errors.username} icon={<User size={15} />} />
                <Input label="Passwort" type="password" placeholder="Mind. 8 Zeichen"
                  value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                  error={errors.password} icon={<Lock size={15} />} />
                <Input label="Passwort bestätigen" type="password" placeholder="Passwort wiederholen"
                  value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                  error={errors.confirm} icon={<Lock size={15} />} />
                <div className="flex gap-3">
                  <Button variant="secondary" type="button" onClick={() => setStep(2)} className="flex-1">Zurück</Button>
                  <Button type="submit" className="flex-1" size="lg" loading={loading} icon={<Shield size={17} />}>
                    Konto erstellen
                  </Button>
                </div>
              </form>
            </motion.div>
          )}

          {/* ── Step 4: Done ── */}
          {step === 4 && (
            <motion.div key="s4" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="p-8 text-center">
              <motion.div
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, delay: 0.1 }}
                className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4"
              >
                <CheckCircle2 size={32} className="text-emerald-400" />
              </motion.div>
              <h2 className="text-xl font-bold text-text-primary">Einrichtung abgeschlossen!</h2>
              <p className="text-text-muted text-sm mt-2">
                ShareDrive ist einsatzbereit. Du bist als Admin eingeloggt.
              </p>
              <div className="mt-4 p-3 bg-bg-elevated rounded-xl border border-border text-left space-y-2">
                <div>
                  <p className="text-xs text-text-muted">URL</p>
                  <p className="text-sm text-primary font-mono mt-0.5">{baseUrl.replace(/\/$/, '')}</p>
                </div>
                {sslApplied && (
                  <div className="flex items-center gap-2 text-xs text-emerald-400 pt-1 border-t border-border">
                    <ShieldCheck size={12} />
                    HTTPS via Let's Encrypt aktiv
                  </div>
                )}
              </div>
              <Button className="w-full mt-6" size="lg" icon={<ArrowRight size={17} />} onClick={() => navigate('/admin')}>
                Zum Admin-Bereich
              </Button>
            </motion.div>
          )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}
