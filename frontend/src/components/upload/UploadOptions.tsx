import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Settings2, Lock, Mail, Calendar, MessageSquare, ChevronDown, Hash } from 'lucide-react'
import { Input, Textarea } from '@/components/ui/Input'
import { Toggle } from '@/components/ui/Toggle'

interface UploadOptionsProps {
  options: {
    title: string
    message: string
    password: string
    expiresInDays: number
    notifyEmail: string
    maxDownloads: string
  }
  onChange: (key: string, value: string | number | boolean) => void
}

export function UploadOptions({ options, onChange }: UploadOptionsProps) {
  const [open, setOpen] = useState(false)
  const [usePassword, setUsePassword] = useState(false)
  const [useNotify, setUseNotify] = useState(false)
  const [useMaxDownloads, setUseMaxDownloads] = useState(false)

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Settings2 size={16} />
          Transfer-Optionen
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={16} />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-2 space-y-4 border-t border-border">
              <Input
                label="Titel (optional)"
                placeholder="Meine wichtigen Dateien"
                value={options.title}
                onChange={(e) => onChange('title', e.target.value)}
                icon={<MessageSquare size={15} />}
              />

              <Textarea
                label="Nachricht (optional)"
                placeholder="Nachricht für den Empfänger..."
                rows={3}
                value={options.message}
                onChange={(e) => onChange('message', e.target.value)}
              />

              <div>
                <label className="text-sm font-medium text-text-secondary block mb-1.5">
                  <Calendar size={14} className="inline mr-1.5" />
                  Läuft ab in
                </label>
                <select
                  value={options.expiresInDays}
                  onChange={(e) => onChange('expiresInDays', parseInt(e.target.value))}
                  className="w-full bg-bg-elevated border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                >
                  <option value={1}>1 Tag</option>
                  <option value={3}>3 Tage</option>
                  <option value={7}>7 Tage</option>
                  <option value={14}>14 Tage</option>
                  <option value={30}>30 Tage</option>
                </select>
              </div>

              <div className="space-y-3">
                <Toggle
                  checked={usePassword}
                  onChange={(v) => { setUsePassword(v); if (!v) onChange('password', '') }}
                  label="Passwortschutz"
                  description="Passwort zum Herunterladen erforderlich"
                />
                <AnimatePresence>
                  {usePassword && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <Input
                        type="password"
                        placeholder="Passwort eingeben"
                        value={options.password}
                        onChange={(e) => onChange('password', e.target.value)}
                        icon={<Lock size={15} />}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="space-y-3">
                <Toggle
                  checked={useNotify}
                  onChange={(v) => { setUseNotify(v); if (!v) onChange('notifyEmail', '') }}
                  label="E-Mail-Benachrichtigung"
                  description="Benachrichtigung bei Download"
                />
                <AnimatePresence>
                  {useNotify && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <Input
                        type="email"
                        placeholder="your@email.com"
                        value={options.notifyEmail}
                        onChange={(e) => onChange('notifyEmail', e.target.value)}
                        icon={<Mail size={15} />}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="space-y-3">
                <Toggle
                  checked={useMaxDownloads}
                  onChange={(v) => { setUseMaxDownloads(v); if (!v) onChange('maxDownloads', '') }}
                  label="Downloadlimit"
                  description="Transfer nach N Downloads automatisch sperren"
                />
                <AnimatePresence>
                  {useMaxDownloads && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <Input
                        type="number"
                        min={1}
                        placeholder="z. B. 5"
                        value={options.maxDownloads}
                        onChange={(e) => onChange('maxDownloads', e.target.value)}
                        icon={<Hash size={15} />}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
