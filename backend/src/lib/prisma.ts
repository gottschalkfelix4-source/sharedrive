import { PrismaClient } from '@prisma/client'

let _client = new PrismaClient()

// Proxy so all existing `prisma.xxx` calls automatically use the current client,
// even after reconnectPrisma() replaces it mid-process.
export const prisma = new Proxy({} as PrismaClient, {
  get(_t, prop) {
    const value = Reflect.get(_client, prop)
    return typeof value === 'function' ? value.bind(_client) : value
  },
})

// Call after ALTER ROLE to swap in a fresh client with the new password.
export async function reconnectPrisma(databaseUrl: string): Promise<void> {
  const old = _client
  const next = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  try {
    await next.$connect()
  } catch (err) {
    await next.$disconnect()
    throw err
  }
  _client = next
  await old.$disconnect().catch(() => {})
}
