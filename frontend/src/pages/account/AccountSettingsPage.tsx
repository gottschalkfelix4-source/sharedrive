import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { KeyRound, Lock, ShieldCheck, ShieldOff, LogOut, Copy, Check, Loader2, Smartphone } from 'lucide-react'
import {
  getMe,
  changePassword,
  logoutAllDevices,
  setupTwoFactor,
  verifyTwoFactor,
  disableTwoFactor,
} from '@/api/auth'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import toast from 'react-hot-toast'

export function AccountSettingsPage() {
  const navigate = useNavigate()
  const { user, setAuth, clearAuth } = useAuthStore()
  const [totpEnabled, setTotpEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    getMe().then((me) => setTotpEnabled(!!me.totpEnabled)).catch(() => {})
  }, [])

  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [pwLoading, setPwLoading] = useState(false)

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pwForm.newPassword.length < 8) {
      toast.error('Neues Passwort muss mindestens 8 Zeichen lang sein')
      return
    }
    if (pwForm.newPassword !== pwForm.confirm) {
      toast.error('Passwörter stimmen nicht überein')
      return
    }
    setPwLoading(true)
    try {
      const { token, user: u } = await changePassword(pwForm.currentPassword, pwForm.newPassword)
      setAuth(u, token)
      setPwForm({ currentPassword: '', newPassword: '', confirm: '' })
      toast.success('Passwort wurde geändert')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Passwort konnte nicht geändert werden')
    } finally {
      setPwLoading(false)
    }
  }

  const [setupOpen, setSetupOpen] = useState(false)
  const [setupLoading, setSetupLoading] = useState(false)
  const [setupData, setSetupData] = useState<{ secret: string; qrCodeDataUrl: string } | null>(null)
  const [setupCode, setSetupCode] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null)
  const [verifyLoading, setVerifyLoading] = useState(false)

  const openSetup = async () => {
    setSetupOpen(true)
    setBackupCodes(null)
    setSetupCode('')
    setSetupLoading(true)
    try {
      const data = await setupTwoFactor()
      setSetupData(data)
    } catch {
      toast.error('2FA-Setup konnte nicht gestartet werden')
      setSetupOpen(false)
    } finally {
      setSetupLoading(false)
    }
  }

  const handleVerifySetup = async (e: React.FormEvent) => {
    e.preventDefault()
    setVerifyLoading(true)
    try {
      const result = await verifyTwoFactor(setupCode)
      setAuth(result.user, result.token)
      setBackupCodes(result.backupCodes)
      setTotpEnabled(true)
      toast.success('Zwei-Faktor-Authentifizierung aktiviert')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Code ungültig')
    } finally {
      setVerifyLoading(false)
    }
  }

  const closeSetup = () => {
    setSetupOpen(false)
    setSetupData(null)
    setSetupCode('')
    setBackupCodes(null)
  }

  const [disableOpen, setDisableOpen] = useState(false)
  const [disablePassword, setDisablePassword] = useState('')
  const [disableLoading, setDisableLoading] = useState(false)

  const handleDisable = async (e: React.FormEvent) => {
    e.preventDefault()
    setDisableLoading(true)
    try {
      const { token, user: u } = await disableTwoFactor(disablePassword)
      setAuth(u, token)
      setTotpEnabled(false)
      setDisableOpen(false)
      setDisablePassword('')
      toast.success('Zwei-Faktor-Authentifizierung deaktiviert')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Passwort ist falsch')
    } finally {
      setDisableLoading(false)
    }
  }

  const [logoutLoading, setLogoutLoading] = useState(false)
  const handleLogoutAll = async () => {
    setLogoutLoading(true)
    try {
      await logoutAllDevices()
      clearAuth()
      toast.success('Von allen Geräten abgemeldet')
      navigate('/login')
    } catch {
      toast.error('Aktion fehlgeschlagen')
    } finally {
      setLogoutLoading(false)
    }
  }

  const copyBackupCodes = () => {
    if (!backupCodes) return
    navigator.clipboard.writeText(backupCodes.join('\n'))
    toast.success('Backup-Codes kopiert')
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Konto-Einstellungen</h1>
          <p className="text-text-muted text-sm mt-1">Verwalte dein Passwort und deine Sicherheitseinstellungen</p>
        </div>

        <Card className="p-6">
          <h2 className="text-sm font-semibold text-text-primary mb-4">Konto</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-text-muted text-xs">Benutzername</p>
              <p className="text-text-primary mt-0.5">@{user?.username}</p>
            </div>
            <div>
              <p className="text-text-muted text-xs">E-Mail</p>
              <p className="text-text-primary mt-0.5">{user?.email}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-sm font-semibold text-text-primary mb-4">Passwort ändern</h2>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <Input
              label="Aktuelles Passwort"
              type="password"
              value={pwForm.currentPassword}
              onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
              icon={<Lock size={15} />}
              required
            />
            <Input
              label="Neues Passwort"
              type="password"
              placeholder="Mind. 8 Zeichen"
              value={pwForm.newPassword}
              onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
              icon={<Lock size={15} />}
              required
            />
            <Input
              label="Neues Passwort bestätigen"
              type="password"
              value={pwForm.confirm}
              onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
              icon={<Lock size={15} />}
              required
            />
            <Button type="submit" loading={pwLoading} icon={<KeyRound size={15} />}>
              Passwort ändern
            </Button>
          </form>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-text-primary">Zwei-Faktor-Authentifizierung</h2>
            {totpEnabled === null ? null : totpEnabled ? (
              <Badge variant="success">Aktiv</Badge>
            ) : (
              <Badge variant="default">Inaktiv</Badge>
            )}
          </div>
          <p className="text-xs text-text-muted mb-4">
            Schützt dein Konto mit einem zusätzlichen Code aus einer Authenticator-App beim Anmelden.
          </p>
          {totpEnabled ? (
            <Button variant="danger" icon={<ShieldOff size={15} />} onClick={() => setDisableOpen(true)}>
              2FA deaktivieren
            </Button>
          ) : (
            <Button icon={<ShieldCheck size={15} />} onClick={openSetup}>
              2FA aktivieren
            </Button>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="text-sm font-semibold text-text-primary mb-1">Sitzungen</h2>
          <p className="text-xs text-text-muted mb-4">
            Meldet alle aktiven Sitzungen ab — auch auf anderen Geräten. Du musst dich danach erneut anmelden.
          </p>
          <Button variant="secondary" loading={logoutLoading} icon={<LogOut size={15} />} onClick={handleLogoutAll}>
            Von allen Geräten abmelden
          </Button>
        </Card>
      </motion.div>

      <Modal open={setupOpen} onClose={closeSetup} title="Zwei-Faktor-Authentifizierung einrichten" maxWidth="max-w-sm">
        {backupCodes ? (
          <div className="space-y-4">
            <p className="text-sm text-text-muted">
              Speichere diese Backup-Codes an einem sicheren Ort. Jeder Code kann einmal verwendet werden, falls du
              keinen Zugriff auf deine Authenticator-App hast.
            </p>
            <div className="bg-bg-elevated border border-border rounded-xl p-4 grid grid-cols-2 gap-2 font-mono text-xs text-text-primary">
              {backupCodes.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <Button variant="secondary" className="w-full" icon={<Copy size={15} />} onClick={copyBackupCodes}>
              Codes kopieren
            </Button>
            <Button className="w-full" icon={<Check size={15} />} onClick={closeSetup}>
              Fertig
            </Button>
          </div>
        ) : setupLoading || !setupData ? (
          <div className="flex justify-center py-8">
            <Loader2 size={28} className="text-primary animate-spin" />
          </div>
        ) : (
          <form onSubmit={handleVerifySetup} className="space-y-4">
            <div className="flex justify-center">
              <img src={setupData.qrCodeDataUrl} alt="QR-Code" className="rounded-xl border border-border" />
            </div>
            <p className="text-xs text-text-muted text-center">
              Scanne den QR-Code mit deiner Authenticator-App (z. B. Google Authenticator, Authy) oder gib den
              Code manuell ein:
            </p>
            <p className="text-center font-mono text-xs text-text-primary bg-bg-elevated border border-border rounded-lg py-2 px-3 break-all">
              {setupData.secret}
            </p>
            <Input
              label="Bestätigungscode"
              placeholder="123456"
              value={setupCode}
              onChange={(e) => setSetupCode(e.target.value)}
              icon={<Smartphone size={15} />}
              autoFocus
              required
            />
            <Button type="submit" className="w-full" loading={verifyLoading} icon={<Check size={15} />}>
              Bestätigen
            </Button>
          </form>
        )}
      </Modal>

      <Modal open={disableOpen} onClose={() => setDisableOpen(false)} title="2FA deaktivieren" maxWidth="max-w-sm">
        <form onSubmit={handleDisable} className="space-y-4">
          <p className="text-sm text-text-muted">
            Bitte bestätige dein Passwort, um die Zwei-Faktor-Authentifizierung zu deaktivieren.
          </p>
          <Input
            label="Passwort"
            type="password"
            value={disablePassword}
            onChange={(e) => setDisablePassword(e.target.value)}
            icon={<Lock size={15} />}
            autoFocus
            required
          />
          <Button type="submit" variant="danger" className="w-full" loading={disableLoading} icon={<ShieldOff size={15} />}>
            Deaktivieren
          </Button>
        </form>
      </Modal>
    </div>
  )
}
