import * as Minio from 'minio'
import { Readable } from 'stream'
import { config } from '../config'
import { prisma } from './prisma'

// Default/local storage — always available, used as fallback and for site assets.
export const minioClient = new Minio.Client({
  endPoint: config.minio.endpoint,
  port: config.minio.port,
  useSSL: config.minio.useSSL,
  accessKey: config.minio.accessKey,
  secretKey: config.minio.secretKey,
})

// Admin-configurable external S3 storage — merged into routes/settings.ts's DEFAULT_SETTINGS.
export const DEFAULT_S3_SETTINGS: Record<string, string> = {
  'storage.s3Enabled': 'false',
  'storage.s3Endpoint': '',
  'storage.s3Port': '443',
  'storage.s3UseSSL': 'true',
  'storage.s3Region': '',
  'storage.s3Bucket': '',
  'storage.s3AccessKey': '',
  'storage.s3SecretKey': '',
}

interface ActiveStorage {
  client: Minio.Client
  bucket: string
}

export interface S3ConnectionOptions {
  endpoint: string
  port: number
  useSSL: boolean
  region?: string
  bucket: string
  accessKey: string
  secretKey: string
}

function buildClient(opts: Omit<S3ConnectionOptions, 'bucket'>): Minio.Client {
  return new Minio.Client({
    endPoint: opts.endpoint,
    port: opts.port,
    useSSL: opts.useSSL,
    region: opts.region || undefined,
    accessKey: opts.accessKey,
    secretKey: opts.secretKey,
  })
}

async function resolveActiveStorage(): Promise<ActiveStorage> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: Object.keys(DEFAULT_S3_SETTINGS) } },
  })
  const s: Record<string, string> = { ...DEFAULT_S3_SETTINGS }
  for (const r of rows) s[r.key] = r.value

  if (s['storage.s3Enabled'] !== 'true' || !s['storage.s3Endpoint'] || !s['storage.s3Bucket']) {
    return { client: minioClient, bucket: config.minio.bucket }
  }

  const client = buildClient({
    endpoint: s['storage.s3Endpoint'],
    port: parseInt(s['storage.s3Port']) || 443,
    useSSL: s['storage.s3UseSSL'] !== 'false',
    region: s['storage.s3Region'],
    accessKey: s['storage.s3AccessKey'],
    secretKey: s['storage.s3SecretKey'],
  })
  return { client, bucket: s['storage.s3Bucket'] }
}

let cachedStorage: Promise<ActiveStorage> | null = null

// Call after admin updates storage.s3.* settings so the new backend takes effect immediately.
export function reloadStorageConfig(): void {
  cachedStorage = null
}

async function getActiveStorage(): Promise<ActiveStorage> {
  if (!cachedStorage) cachedStorage = resolveActiveStorage()
  return cachedStorage
}

// Verifies a candidate S3 connection without affecting the active storage backend.
export async function testS3Connection(opts: S3ConnectionOptions): Promise<void> {
  const client = buildClient(opts)
  const exists = await client.bucketExists(opts.bucket)
  if (!exists) throw new Error('Bucket nicht gefunden oder keine Zugriffsrechte')
}

export async function ensureBucket(): Promise<void> {
  const exists = await minioClient.bucketExists(config.minio.bucket)
  if (!exists) {
    await minioClient.makeBucket(config.minio.bucket)
    console.log(`Bucket '${config.minio.bucket}' created`)
  }
}

export async function uploadStream(
  key: string,
  stream: Readable,
  mimeType: string
): Promise<void> {
  const { client, bucket } = await getActiveStorage()
  await client.putObject(bucket, key, stream, undefined, {
    'Content-Type': mimeType,
  })
}

export async function getPresignedDownloadUrl(key: string, filename: string): Promise<string> {
  const { client, bucket } = await getActiveStorage()
  return client.presignedGetObject(bucket, key, 3600, {
    'response-content-disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
  })
}

export async function deleteObject(key: string): Promise<void> {
  const { client, bucket } = await getActiveStorage()
  await client.removeObject(bucket, key)
}

export async function deleteObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) return
  const { client, bucket } = await getActiveStorage()
  for (const key of keys) {
    try {
      await client.removeObject(bucket, key)
    } catch (err) {
      console.error(`Failed to delete object ${key}:`, err)
    }
  }
}

export async function getObjectStream(key: string): Promise<Readable> {
  const { client, bucket } = await getActiveStorage()
  const stream = await client.getObject(bucket, key)
  return stream as unknown as Readable
}

export async function initiateMultipartUpload(key: string, mimeType: string): Promise<string> {
  const { client, bucket } = await getActiveStorage()
  return client.initiateNewMultipartUpload(bucket, key, {
    'Content-Type': mimeType,
  })
}

export async function uploadFilePart(
  key: string,
  uploadId: string,
  partNumber: number,
  data: Buffer,
): Promise<{ etag: string; part: number }> {
  const { client, bucket } = await getActiveStorage()
  return client.uploadPart(
    {
      bucketName: bucket,
      objectName: key,
      uploadID: uploadId,
      partNumber,
      headers: { 'content-length': String(data.length) },
    },
    data,
  )
}

export async function completeFileParts(
  key: string,
  uploadId: string,
  parts: { part: number; etag: string }[],
): Promise<void> {
  const { client, bucket } = await getActiveStorage()
  await client.completeMultipartUpload(
    bucket,
    key,
    uploadId,
    parts.slice().sort((a, b) => a.part - b.part),
  )
}

export async function abortMultipartUpload(key: string, uploadId: string): Promise<void> {
  const { client, bucket } = await getActiveStorage()
  await client.abortMultipartUpload(bucket, key, uploadId)
}
