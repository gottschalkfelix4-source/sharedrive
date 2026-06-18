import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, Palette, Upload, X, Image } from 'lucide-react'
import { getAllSettings, updateSettings, uploadAsset, deleteAsset } from '@/api/settings'
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
}: {
  label: string
  hint: string
  value: string
  type: 'logo' | 'favicon'
  onUploaded: (url: string) => void
  onDeleted: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Only image files are allowed')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('File too large — max 2 MB')
      return
    }
    setUploading(true)
    try {
      const url = await uploadAsset(type, file)
      onUploaded(url)
      toast.success(`${label} uploaded`)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteAsset(type)
      onDeleted()
      toast.success(`${label} removed`)
    } catch {
      toast.error('Failed to remove')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <label className="text-sm font-medium text-text-secondary block mb-2">{label}</label>
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
          className={`flex-1 border-2 border-dashed rounded-xl p-4 text-center transition-colors cursor-pointer ${
            dragOver
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-border-strong hover:bg-white/[0.02]'
          }`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
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
              <span className="text-sm text-text-muted">Uploading…</span>
            </div>
          ) : (
            <>
              <Upload size={18} className="text-text-muted mx-auto mb-1" />
              <p className="text-sm text-text-secondary">
                {value ? 'Replace image' : 'Click or drag to upload'}
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
            onClick={handleDelete}
            title={`Remove ${label}`}
          />
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
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
  const { data: settings, isLoading } = useQuery({ queryKey: ['admin-settings'], queryFn: getAllSettings })

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
    mutationFn: () => updateSettings({ 'appearance.primaryColor': color }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] })
      toast.success('Settings saved')
    },
    onError: () => toast.error('Failed to save'),
  })

  if (isLoading) return <div className="flex justify-center py-8"><Spinner /></div>

  return (
    <div className="bg-bg-card border border-border rounded-2xl p-6 space-y-6">
      <div className="flex items-center gap-3 pb-4 border-b border-border">
        <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center">
          <Palette size={20} />
        </div>
        <div>
          <h2 className="font-semibold text-text-primary">Appearance</h2>
          <p className="text-xs text-text-muted">Brand colors and visual identity</p>
        </div>
      </div>

      <div className="space-y-8">
        {/* Color picker */}
        <div>
          <label className="text-sm font-medium text-text-secondary block mb-3">Primary Color</label>
          <div className="flex items-center gap-3 flex-wrap">
            {presetColors.map((c) => (
              <button
                key={c.value}
                type="button"
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
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-9 h-9 rounded-xl border border-border cursor-pointer bg-transparent"
              />
              <span className="text-sm text-text-muted font-mono">{color}</span>
            </div>
          </div>

          <div className="mt-4 p-4 bg-bg-elevated rounded-xl border border-border">
            <p className="text-xs text-text-muted mb-2">Preview</p>
            <div className="flex gap-2">
              <button
                className="px-4 py-2 rounded-xl text-sm text-white font-medium"
                style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
              >
                Upload
              </button>
              <div
                className="px-4 py-2 rounded-xl text-sm border"
                style={{ borderColor: `${color}50`, color }}
              >
                Learn more
              </div>
            </div>
          </div>
        </div>

        {/* Logo upload */}
        <ImageUpload
          label="Logo"
          hint="Shown in the navbar. Replaces the text logo. Recommended: PNG or SVG, min 120 px tall."
          value={logoUrl}
          type="logo"
          onUploaded={(url) => setLogoUrl(url)}
          onDeleted={() => setLogoUrl('')}
        />

        {/* Favicon upload */}
        <ImageUpload
          label="Favicon"
          hint="Browser tab icon. Recommended: ICO, PNG or SVG, 32×32 px."
          value={faviconUrl}
          type="favicon"
          onUploaded={(url) => setFaviconUrl(url)}
          onDeleted={() => setFaviconUrl('')}
        />
      </div>

      <div className="flex justify-end pt-2 border-t border-border">
        <Button icon={<Save size={15} />} loading={mutation.isPending} onClick={() => mutation.mutate()}>
          Save color
        </Button>
      </div>
    </div>
  )
}
