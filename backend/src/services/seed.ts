import { prisma } from '../lib/prisma'
import { DEFAULT_SETTINGS } from '../routes/settings'

export async function seedSettings(): Promise<void> {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.setting.upsert({
      where: { key },
      update: {},
      create: { key, value },
    })
  }
  console.log('Default settings initialized')
}
