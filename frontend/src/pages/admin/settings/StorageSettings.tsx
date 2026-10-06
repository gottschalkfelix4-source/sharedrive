import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Save, HardDrive, Cloud, TestTube } from 'lucide-react'
import { getAllSettings, updateSettings, testS3Connection } from '@/api/settings'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Toggle } from '@/components/ui/Toggle'
import { Spinner } from '@/components/ui/Spinner'
import { formatBytes } from '@/lib/utils'
import toast from 'react-hot-toast'

function bytesToGB(bytes: string) { return (parseInt(bytes) / 1e9).toString() }
function gbToBytes(gb: string) { return Math.round(parseFloat(gb) * 1e9).toString() }

export function StorageSettings() {
  const { data: settings, isLoading } = useQuery({ queryKey: ['admin-settings'], queryFn: getAllSettings })

  const [form, setForm] = useState({
    maxFileSizeGB: '5',
    maxTransferSizeGB: '10',
    userStorageQuotaGB: '0',
    retentionAnonymous: '7',
    retentionRegistered: '30',
  })

  const [s3Form, setS3Form] = useState({
    enabled: false,
    endpoint: '',
    port: '443',
    useSSL: true,
    region: '',
    bucket: '',
    accessKey: '',
    secretKey: '',
  })
  const [s3TestLoading, setS3TestLoading] = useState(false)

  useEffect(() => {
    if (settings) {
      setForm({
        maxFileSizeGB: bytesToGB(settings['storage.maxFileSizeBytes'] || '5368709120'),
        maxTransferSizeGB: bytesToGB(settings['storage.maxTransferSizeBytes'] || '10737418240'),
        userStorageQuotaGB: bytesToGB(settings['storage.userStorageQuotaBytes'] || '0'),
        retentionAnonymous: settings['storage.retentionDaysAnonymous'] || '7',
        retentionRegistered: settings['storage.retentionDaysRegistered'] || '30',
      })
      setS3Form({
        enabled: settings['storage.s3Enabled'] === 'true',
        endpoint: settings['storage.s3Endpoint'] || '',
        port: settings['storage.s3Port'] || '443',
        useSSL: settings['storage.s3UseSSL'] !== 'false',
        region: settings['storage.s3Region'] || '',
        bucket: settings['storage.s3Bucket'] || '',
        accessKey: settings['storage.s3AccessKey'] || '',
        secretKey: settings['storage.s3SecretKey']?.includes('•') ? '' : settings['storage.s3SecretKey'] || '',
      })
    }
  }, [settings])

  const mutation = useMutation({
    mutationFn: (f: typeof form) =>
      updateSettings({
        'storage.maxFileSizeBytes': gbToBytes(f.maxFileSizeGB),
        'storage.maxTransferSizeBytes': gbToBytes(f.maxTransferSizeGB),
        'storage.userStorageQuotaBytes': gbToBytes(f.userStorageQuotaGB),
        'storage.retentionDaysAnonymous': f.retentionAnonymous,
        'storage.retentionDaysRegistered': f.retentionRegistered,
      }),
    onSuccess: () => toast.success('Einstellungen gespeichert'),
    onError: () => toast.error('Speichern fehlgeschlagen'),
  })

  const s3Mutation = useMutation({
    mutationFn: (f: typeof s3Form) =>
      updateSettings({
        'storage.s3Enabled': String(f.enabled),
        'storage.s3Endpoint': f.endpoint,
        'storage.s3Port': f.port,
        'storage.s3UseSSL': String(f.useSSL),
        'storage.s3Region': f.region,
        'storage.s3Bucket': f.bucket,
        'storage.s3AccessKey': f.accessKey,
        ...(f.secretKey ? { 'storage.s3SecretKey': f.secretKey } : {}),
      }),
    onSuccess: () => toast.success('S3-Einstellungen gespeichert'),
    onError: () => toast.error('Speichern fehlgeschlagen'),
  })

  const handleTestS3 = async () => {
    if (!s3Form.endpoint || !s3Form.bucket || !s3Form.accessKey) {
      toast.error('Endpoint, Bucket und Access Key eingeben')
      return
    }
    setS3TestLoading(true)
    try {
      await testS3Connection({
        endpoint: s3Form.endpoint,
        port: parseInt(s3Form.port) || 443,
        useSSL: s3Form.useSSL,
        region: s3Form.region || undefined,
        bucket: s3Form.bucket,
        accessKey: s3Form.accessKey,
        secretKey: s3Form.secretKey || settings?.['storage.s3SecretKey'] || '',
      })
      toast.success('Verbindung erfolgreich')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Verbindung fehlgeschlagen')
    } finally {
      setS3TestLoading(false)
    }
  }

  if (isLoading) return <div className="flex justify-center py-8"><Spinner /></div>

  return (
    <div className="space-y-6">
      <div className="bg-bg-card border border-border rounded-2xl p-6 space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-border">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-400 flex items-center justify-center">
            <HardDrive size={20} />
          </div>
          <div>
            <h2 className="font-semibold text-text-primary">Speicher & Limits</h2>
            <p className="text-xs text-text-muted">Dateigrößen, Transfer-Limits und Aufbewahrungsrichtlinie</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Max. Dateigröße (GB)"
              type="number"
              min="0.1"
              step="0.5"
              value={form.maxFileSizeGB}
              onChange={(e) => setForm({ ...form, maxFileSizeGB: e.target.value })}
              hint={`≈ ${formatBytes(gbToBytes(form.maxFileSizeGB))} pro Datei`}
            />
            <Input
              label="Max. Transfergröße (GB)"
              type="number"
              min="0.1"
              step="1"
              value={form.maxTransferSizeGB}
              onChange={(e) => setForm({ ...form, maxTransferSizeGB: e.target.value })}
              hint={`≈ ${formatBytes(gbToBytes(form.maxTransferSizeGB))} gesamt`}
            />
          </div>

          <div>
            <h3 className="text-sm font-semibold text-text-primary mb-1">Speicherquota pro Nutzer</h3>
            <p className="text-xs text-text-muted mb-3">Wird im Dashboard als Prozentbalken angezeigt. 0 = kein Limit (kein Balken).</p>
            <Input
              label="Quota pro Nutzer (GB)"
              type="number"
              min="0"
              step="1"
              value={form.userStorageQuotaGB}
              onChange={(e) => setForm({ ...form, userStorageQuotaGB: e.target.value })}
              hint={parseFloat(form.userStorageQuotaGB) > 0 ? `≈ ${formatBytes(gbToBytes(form.userStorageQuotaGB))} pro Nutzer` : 'Kein Limit — kein Prozentbalken im Dashboard'}
            />
          </div>

          <div>
            <h3 className="text-sm font-semibold text-text-primary mb-3">Aufbewahrungsrichtlinie</h3>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Anonyme Transfers (Tage)"
                type="number"
                min="1"
                max="365"
                value={form.retentionAnonymous}
                onChange={(e) => setForm({ ...form, retentionAnonymous: e.target.value })}
                hint="Dateien von nicht registrierten Benutzern"
              />
              <Input
                label="Registrierte Benutzer (Tage)"
                type="number"
                min="1"
                max="365"
                value={form.retentionRegistered}
                onChange={(e) => setForm({ ...form, retentionRegistered: e.target.value })}
                hint="Dateien von registrierten Konten"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-border">
          <Button icon={<Save size={15} />} loading={mutation.isPending} onClick={() => mutation.mutate(form)}>
            Änderungen speichern
          </Button>
        </div>
      </div>

      <div className="bg-bg-card border border-border rounded-2xl p-6 space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-border">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
            <Cloud size={20} />
          </div>
          <div>
            <h2 className="font-semibold text-text-primary">Externer S3-Speicher</h2>
            <p className="text-xs text-text-muted">Dateien bei einem S3-kompatiblen Anbieter statt im lokalen Speicher ablegen</p>
          </div>
        </div>

        <Toggle
          checked={s3Form.enabled}
          onChange={(v) => setS3Form({ ...s3Form, enabled: v })}
          label="Externen S3-Speicher verwenden"
          description="Neue Uploads werden bei diesem Anbieter gespeichert, statt im lokalen Standard-Speicher"
        />

        <div className={`space-y-4 transition-opacity ${s3Form.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <Input
                label="Endpoint"
                placeholder="s3.eu-central-1.amazonaws.com"
                value={s3Form.endpoint}
                onChange={(e) => setS3Form({ ...s3Form, endpoint: e.target.value })}
              />
            </div>
            <Input
              label="Port"
              type="number"
              value={s3Form.port}
              onChange={(e) => setS3Form({ ...s3Form, port: e.target.value })}
            />
          </div>

          <Toggle
            checked={s3Form.useSSL}
            onChange={(v) => setS3Form({ ...s3Form, useSSL: v })}
            label="SSL/TLS verwenden"
            description="Für die meisten Anbieter (AWS, Wasabi, Backblaze, …) aktiviert lassen"
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Bucket"
              placeholder="meine-firma-dateien"
              value={s3Form.bucket}
              onChange={(e) => setS3Form({ ...s3Form, bucket: e.target.value })}
            />
            <Input
              label="Region (optional)"
              placeholder="eu-central-1"
              value={s3Form.region}
              onChange={(e) => setS3Form({ ...s3Form, region: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Access Key"
              value={s3Form.accessKey}
              onChange={(e) => setS3Form({ ...s3Form, accessKey: e.target.value })}
            />
            <Input
              label="Secret Key"
              type="password"
              placeholder={settings?.['storage.s3SecretKey']?.includes('•') ? 'Gespeichert (versteckt)' : 'Secret Key eingeben'}
              value={s3Form.secretKey}
              onChange={(e) => setS3Form({ ...s3Form, secretKey: e.target.value })}
            />
          </div>

          <p className="text-xs text-text-muted">
            Bereits hochgeladene Dateien bleiben am bisherigen Speicherort — nur neue Uploads nutzen den neuen Speicher.
          </p>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <Button
            variant="secondary"
            icon={<TestTube size={15} />}
            loading={s3TestLoading}
            onClick={handleTestS3}
            disabled={!s3Form.enabled}
          >
            Verbindung testen
          </Button>
          <Button icon={<Save size={15} />} loading={s3Mutation.isPending} onClick={() => s3Mutation.mutate(s3Form)}>
            Änderungen speichern
          </Button>
        </div>
      </div>
    </div>
  )
}
