import * as Minio from 'minio'
import { Readable } from 'stream'
import { config } from '../config'

export const minioClient = new Minio.Client({
  endPoint: config.minio.endpoint,
  port: config.minio.port,
  useSSL: config.minio.useSSL,
  accessKey: config.minio.accessKey,
  secretKey: config.minio.secretKey,
})

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
  await minioClient.putObject(config.minio.bucket, key, stream, undefined, {
    'Content-Type': mimeType,
  })
}

export async function getPresignedDownloadUrl(key: string, filename: string): Promise<string> {
  return minioClient.presignedGetObject(config.minio.bucket, key, 3600, {
    'response-content-disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
  })
}

export async function deleteObject(key: string): Promise<void> {
  await minioClient.removeObject(config.minio.bucket, key)
}

export async function deleteObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) return
  for (const key of keys) {
    try {
      await minioClient.removeObject(config.minio.bucket, key)
    } catch (err) {
      console.error(`Failed to delete object ${key}:`, err)
    }
  }
}

export async function getObjectStream(key: string): Promise<Readable> {
  const stream = await minioClient.getObject(config.minio.bucket, key)
  return stream as unknown as Readable
}
