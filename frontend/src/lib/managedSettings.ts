export function editableSettings(
  settings: Record<string, string>,
  managedKeys: readonly string[]
): Record<string, string> {
  const managed = new Set(managedKeys)
  return Object.fromEntries(
    Object.entries(settings).filter(([key]) => !managed.has(key))
  )
}
