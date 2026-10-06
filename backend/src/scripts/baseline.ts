// Run once for legacy databases created using `prisma db push`.
// No tables or data are changed; only migration history is recorded after checks.
import { PrismaClient } from '@prisma/client'
import { spawnSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import { createHash } from 'crypto'

const initialMigration = '19700101000000_init'

const required: Record<string, Record<string, string>> = {
  User: {
    id: 'text',
    email: 'text',
    username: 'text',
    password: 'text',
    role: 'USER-DEFINED',
    storageUsed: 'bigint',
    createdAt: 'timestamp without time zone',
    updatedAt: 'timestamp without time zone',
  },
  Transfer: {
    id: 'text',
    shortId: 'text',
    userId: 'text',
    title: 'text',
    message: 'text',
    passwordHash: 'text',
    expiresAt: 'timestamp without time zone',
    maxDownloads: 'integer',
    downloadCount: 'integer',
    notifyEmail: 'text',
    totalSize: 'bigint',
    createdAt: 'timestamp without time zone',
    updatedAt: 'timestamp without time zone',
  },
  File: {
    id: 'text',
    transferId: 'text',
    name: 'text',
    size: 'bigint',
    mimeType: 'text',
    storageKey: 'text',
    createdAt: 'timestamp without time zone',
  },
  DownloadLog: {
    id: 'text',
    transferId: 'text',
    ip: 'text',
    userAgent: 'text',
    createdAt: 'timestamp without time zone',
  },
  Setting: {
    key: 'text',
    value: 'text',
    updatedAt: 'timestamp without time zone',
  },
}
async function main() {
  const db = new PrismaClient()
  try {
    const rows = await db.$queryRaw<
      {
        table_name: string
        column_name: string
        data_type: string
        udt_name: string
      }[]
    >`SELECT table_name,column_name,data_type,udt_name FROM information_schema.columns WHERE table_schema=current_schema()`
    for (const [table, columns] of Object.entries(required))
      for (const [column, type] of Object.entries(columns)) {
        const found = rows.find(
          (r) => r.table_name === table && r.column_name === column
        )
        if (
          !found ||
          found.data_type !== type ||
          (column === 'role' && found.udt_name !== 'Role')
        )
          throw new Error(
            `Legacy baseline mismatch at ${table}.${column}; investigate before proceeding`
          )
      }
    const constraints = await db.$queryRaw<
      { conname: string }[]
    >`SELECT conname FROM pg_constraint WHERE connamespace=current_schema()::regnamespace`
    for (const name of [
      'User_pkey',
      'Transfer_pkey',
      'File_pkey',
      'DownloadLog_pkey',
      'Setting_pkey',
      'Transfer_userId_fkey',
      'File_transferId_fkey',
      'DownloadLog_transferId_fkey',
    ])
      if (!constraints.some((c) => c.conname === name))
        throw new Error(`Missing required constraint: ${name}`)
    const indexes = await db.$queryRaw<
      { indexname: string }[]
    >`SELECT indexname FROM pg_indexes WHERE schemaname=current_schema()`
    for (const name of [
      'User_email_key',
      'User_username_key',
      'Transfer_shortId_key',
    ])
      if (!indexes.some((i) => i.indexname === name))
        throw new Error(`Missing required unique index: ${name}`)
    console.log(
      'Legacy base tables, column types, constraints and unique indexes verified.'
    )
    if (!process.argv.includes('--apply')) {
      console.log(
        'Review your backup, then rerun with --apply --backup-confirmed to record the initial migration or rename its legacy history entry.'
      )
      return
    }
    if (!process.argv.includes('--backup-confirmed'))
      throw new Error('A verified backup is required: pass --backup-confirmed')
    const history = await db.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS(SELECT 1 FROM information_schema.tables
      WHERE table_schema=current_schema() AND table_name='_prisma_migrations') AS exists`
    if (history[0].exists) {
      const recorded = await db.$queryRaw<
        {
          id: string
          migration_name: string
          checksum: string
          finished_at: Date | null
        }[]
      >`SELECT id,migration_name,checksum,finished_at FROM "_prisma_migrations"
        WHERE migration_name IN ('init',${initialMigration}) AND rolled_back_at IS NULL`
      if (recorded.length) {
        const checksum = createHash('sha256')
          .update(
            fs.readFileSync(
              path.resolve(
                'prisma/migrations',
                initialMigration,
                'migration.sql'
              )
            )
          )
          .digest('hex')
        if (
          recorded.length !== 1 ||
          !recorded[0].finished_at ||
          recorded[0].checksum !== checksum
        )
          throw new Error(
            'Initial migration history is incomplete or has a different checksum; investigate before proceeding'
          )
        if (recorded[0].migration_name === 'init') {
          await db.$executeRaw`UPDATE "_prisma_migrations" SET migration_name=${initialMigration}
            WHERE id=${recorded[0].id} AND checksum=${checksum} AND finished_at IS NOT NULL AND rolled_back_at IS NULL`
          console.log(
            'Verified legacy init history renamed; application data and migration checksum preserved.'
          )
        } else
          console.log('Initial migration already recorded; no change required.')
        return
      }
    }
    const result = spawnSync(
      path.resolve('node_modules/.bin/prisma'),
      ['migrate', 'resolve', '--applied', initialMigration],
      { stdio: 'inherit' }
    )
    if (result.status !== 0) throw new Error('Migration baseline failed')
  } finally {
    await db.$disconnect()
  }
}
main().catch((err) => {
  console.error(err instanceof Error ? err.message : 'Baseline failed')
  process.exitCode = 1
})
