import { useState, useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, Palette, Upload, X, Image } from 'lucide-react'
import { uploadAsset, deleteAsset } from '@/api/settings'
import { ManagedStatus, useAdminSettings } from './ManagedSettings'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import toast from 'react-hot-toast'

const presetColors = [
  { label: 'Indigo', value: '#6366f1' },
  { label: 'Violet', value: '#8b5cf6' },
  { label: 'Sky', value: '#0ea5e9' },
  { label: 'Emerald', value: '#10b981' },
  { label: 'Rose', value: '#f43f5e' },
  { label: 'Amber', value: '#f59e0b' },
]

function ImageUpload({
  label,
  hint,
  value,
  type,
  onUploaded,
  onDeleted,
  disabled,
}: {
  label: string
  hint: string
  value: string
  type: 'logo' | 'favicon'
  onUploaded: (url: string) => void
  onDeleted: () => void
  disabled: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const handleFile = async (file: File) => {
    if (disabled) return
    if (!file.type.startsWith('image/')) {
      toast.error('Nur Bilddateien sind erlaubt')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Datei zu groß – max. 2 MB')
      return
    }
    setUploading(true)
    try {
      const url = await uploadAsset(type, file)
      onUploaded(url)
      toast.success(`${label} hochgeladen`)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Upload fehlgeschlagen')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async () => {
    if (disabled) return
    setDeleting(true)
    try {
      await deleteAsset(type)
      onDeleted()
      toast.success(`${label} entfernt`)
    } catch {
      toast.error('Entfernen fehlgeschlagen')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <label className="text-sm font-medium text-text-secondary block mb-2">{label}</label>
      <ManagedStatus settingKey={`appearance.${type}Url`} />
      <p className="text-xs text-text-muted mb-3">{hint}</p>

      <div className="flex items-start gap-4">
        {/* Preview */}
        <div className="w-20 h-20 rounded-xl border border-border bg-bg-elevated flex items-center justify-center flex-shrink-0 overflow-hidden">
          {value ? (
            <img
              src={value}
              alt={label}
              className="w-full h-full object-contain p-2"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          ) : (
            <Image size={24} className="text-text-muted" />
          )}
        </div>

        {/* Drop zone */}
        <div
          aria-disabled={disabled}
          className={`flex-1 border-2 border-dashed rounded-xl p-4 text-center transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${
            dragOver
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-border-strong hover:bg-white/[0.02]'
          }`}
          onClick={() => { if (!disabled) inputRef.current?.click() }}
          onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            const file = e.dataTransfer.files[0]
            if (file) handleFile(file)
          }}
        >
          {uploading ? (
            <div className="flex items-center justify-center gap-2 py-1">
              <Spinner size="sm" />
              <span className="text-sm text-text-muted">Wird hochgeladen…</span>
            </div>
          ) : (
            <>
              <Upload size={18} className="text-text-muted mx-auto mb-1" />
              <p className="text-sm text-text-secondary">
                {disabled ? 'Ueber Docker verwaltet' : value ? 'Bild ersetzen' : 'Klicken oder ablegen'}
              </p>
              <p className="text-xs text-text-muted mt-0.5">PNG, JPG, SVG, ICO — max 2 MB</p>
            </>
          )}
        </div>

        {/* Remove button */}
        {value && (
          <Button
            variant="danger"
            size="sm"
            icon={<X size={14} />}
            loading={deleting}
            disabled={disabled}
            onClick={handleDelete}
            title={`Remove ${label}`}
          />
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        disabled={disabled}
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}

export function AppearanceSettings() {
  const queryClient = useQueryClient()
  const { settings, isLoading, saveSettings, isManaged } = useAdminSettings()

  const [color, setColor] = useState('#6366f1')
  const [logoUrl, setLogoUrl] = useState('')
  const [faviconUrl, setFaviconUrl] = useState('')

  useEffect(() => {
    if (settings) {
      setColor(settings['appearance.primaryColor'] || '#6366f1')
      setLogoUrl(settings['appearance.logoUrl'] || '')
      setFaviconUrl(settings['appearance.faviconUrl'] || '')
    }
  }, [settings])

  const mutation = useMutation({
    mutationFn: () => saveSettings({ 'appearance.primaryColor': color }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] })
      toast.success('Einstellungen gespeichert')
    },
    onError: () => toast.error('Speichern fehlgeschlagen'),
  })

  if (isLoading) return <div className="flex justify-center py-8"><Spinner /></div>

  return (
    <div className="bg-bg-card border border-border rounded-2xl p-6 space-y-6">
      <div className="flex items-center gap-3 pb-4 border-b border-border">
        <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center">
          <Palette size={20} />
        </div>
        <div>
          <h2 className="font-semibold text-text-primary">Erscheinungsbild</h2>
          <p className="text-xs text-text-muted">Markenfarben und visuelle Identität</p>
        </div>
      </div>

      <div className="space-y-8">
        {/* Color picker */}
        <div>
          <label className="text-sm font-medium text-text-secondary block mb-3">Primärfarbe</label>
          <ManagedStatus settingKey="appearance.primaryColor" />
          <div className="flex items-center gap-3 flex-wrap">
            {presetColors.map((c) => (
              <button
                key={c.value}
                type="button"
                disabled={isManaged('appearance.primaryColor')}
                onClick={() => setColor(c.value)}
                className={`w-9 h-9 rounded-xl transition-all duration-200 ${
                  color === c.value
                    ? 'ring-2 ring-white ring-offset-2 ring-offset-bg scale-110'
                    : 'hover:scale-105'
                }`}
                style={{ backgroundColor: c.value }}
                title={c.label}
              />
            ))}
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Primaerfarbe"
                disabled={isManaged('appearance.primaryColor')}
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-9 h-9 rounded-xl border border-border cursor-pointer bg-transparent"
              />
              <span className="text-sm text-text-muted font-mono">{color}</span>
            </div>
          </div>

          <div className="mt-4 p-4 bg-bg-elevated rounded-xl border border-border">
            <p className="text-xs text-text-muted mb-2">Vorschau</p>
            <div className="flex gap-2">
              <button
                className="px-4 py-2 rounded-xl text-sm text-white font-medium"
                style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
              >
                Hochladen
              </button>
              <div
                className="px-4 py-2 rounded-xl text-sm border"
                style={{ borderColor: `${color}50`, color }}
              >
                Mehr erfahren
              </div>
            </div>
          </div>
        </div>

        {/* Logo upload */}
        <ImageUpload
          label="Logo"
          hint="Wird in der Navbar angezeigt. Ersetzt das Text-Logo. Empfohlen: PNG oder SVG, mind. 120 px hoch."
          value={logoUrl}
          type="logo"
          disabled={isManaged('appearance.logoUrl')}
          onUploaded={(url) => setLogoUrl(url)}
          onDeleted={() => setLogoUrl('')}
        />

        {/* Favicon upload */}
        <ImageUpload
          label="Favicon"
          hint="Browser-Tab-Icon. Empfohlen: ICO, PNG oder SVG, 32×32 px."
          value={faviconUrl}
          type="favicon"
          disabled={isManaged('appearance.faviconUrl')}
          onUploaded={(url) => setFaviconUrl(url)}
          onDeleted={() => setFaviconUrl('')}
        />
      </div>

      <div className="flex justify-end pt-2 border-t border-border">
        <Button icon={<Save size={15} />} loading={mutation.isPending} disabled={isManaged('appearance.primaryColor')} onClick={() => mutation.mutate()}>
          Farbe speichern
        </Button>
      </div>
    </div>
  )
}
