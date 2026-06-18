import { PrismaClient } from '@prisma/client'

let _client = new PrismaClient()

// Proxy so all existing `prisma.xxx` calls automatically use the current client,
// even after reconnectPrisma() replaces it mid-process.
export const prisma = new Proxy({} as PrismaClient, {
  get(_t, prop) {
    return (_client as any)[prop]
  },
})

// Call after ALTER ROLE to swap in a fresh client with the new password.
export async function reconnectPrisma(databaseUrl: string): Promise<void> {
  const old = _client
  _client = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  await _client.$connect()
  await old.$disconnect().catch(() => {})
}
