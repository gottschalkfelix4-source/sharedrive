import { createContext, useContext, type ComponentProps, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAdminSettings, updateSettings } from '@/api/settings'
import { Input, Textarea } from '@/components/ui/Input'
import { Toggle } from '@/components/ui/Toggle'
import { editableSettings } from '@/lib/managedSettings'
import type { AllSettings } from '@/types'

interface SettingsContextValue {
  settings: AllSettings | undefined
  isLoading: boolean
  isManaged: (key: string) => boolean
  canSave: (keys: string[]) => boolean
  saveSettings: (settings: Record<string, string>) => Promise<void>
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function ManagedSettingsProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: getAdminSettings,
  })
  const managedKeys = data?.managedKeys ?? []
  const isManaged = (key: string) => managedKeys.includes(key)
  const saveSettings = async (settings: Record<string, string>) => {
    const editable = editableSettings(settings, managedKeys)
    if (Object.keys(editable).length === 0) return
    await updateSettings(editable)
  }

  return (
    <SettingsContext.Provider value={{
      settings: data?.settings, isLoading, isManaged,
      canSave: (keys) => keys.some((key) => !isManaged(key)),
      saveSettings,
    }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useAdminSettings() {
  const context = useContext(SettingsContext)
  if (!context) throw new Error('Settings context is missing')
  return context
}

export function ManagedStatus({ settingKey }: { settingKey: string }) {
  const { isManaged } = useAdminSettings()
  return isManaged(settingKey)
    ? <span className="text-xs text-text-muted" title="Ueber Docker verwaltet">Docker</span>
    : null
}

export function ManagedInput({ settingKey, ...props }: ComponentProps<typeof Input> & { settingKey: string }) {
  const { isManaged } = useAdminSettings()
  return (
    <div className="space-y-1">
      <Input {...props} disabled={props.disabled || isManaged(settingKey)} />
      <ManagedStatus settingKey={settingKey} />
    </div>
  )
}

export function ManagedTextarea({ settingKey, ...props }: ComponentProps<typeof Textarea> & { settingKey: string }) {
  const { isManaged } = useAdminSettings()
  return (
    <div className="space-y-1">
      <Textarea {...props} disabled={props.disabled || isManaged(settingKey)} />
      <ManagedStatus settingKey={settingKey} />
    </div>
  )
}

export function ManagedToggle({ settingKey, ...props }: ComponentProps<typeof Toggle> & { settingKey: string }) {
  const { isManaged } = useAdminSettings()
  return (
    <div className="space-y-1">
      <Toggle {...props} disabled={props.disabled || isManaged(settingKey)} />
      <ManagedStatus settingKey={settingKey} />
    </div>
  )
}
