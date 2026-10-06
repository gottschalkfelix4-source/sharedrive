// Explicit test double for storage-command failure and API validation tests.
// This does not verify the MinIO protocol/SDK or substitute for real integration.
import { Readable } from 'stream'
import { createHash, randomUUID } from 'crypto'
import { minioClient } from '../src/lib/minio'
export function installMemoryStorageFixture() {
  const objects = new Map<string, Buffer>(),
    uploads = new Map<string, { key: string; parts: Map<number, Buffer> }>()
  const missing = (code: string) => Object.assign(new Error(code), { code })
  const client = minioClient as any
  client.bucketExists = async () => true
  client.makeBucket = async () => {}
  client.initiateNewMultipartUpload = async (_bucket: string, key: string) => {
    const id = randomUUID()
    uploads.set(id, { key, parts: new Map() })
    return id
  }
  client.uploadPart = async (info: any, bytes: Buffer) => {
    const upload = uploads.get(info.uploadID)
    if (!upload || upload.key !== info.objectName) throw missing('NoSuchUpload')
    upload.parts.set(info.partNumber, Buffer.from(bytes))
    return {
      part: info.partNumber,
      etag: createHash('md5').update(bytes).digest('hex'),
    }
  }
  client.completeMultipartUpload = async (
    _bucket: string,
    key: string,
    id: string,
    parts: { part: number }[]
  ) => {
    const upload = uploads.get(id)
    if (!upload || upload.key !== key) throw missing('NoSuchUpload')
    objects.set(key, Buffer.concat(parts.map((p) => upload.parts.get(p.part)!)))
    uploads.delete(id)
  }
  client.abortMultipartUpload = async (
    _bucket: string,
    _key: string,
    id: string
  ) => {
    if (!uploads.delete(id)) throw missing('NoSuchUpload')
  }
  client.putObject = async (
    _bucket: string,
    key: string,
    input: Buffer | Readable
  ) => {
    if (Buffer.isBuffer(input)) objects.set(key, Buffer.from(input))
    else {
      const chunks: Buffer[] = []
      for await (const chunk of input) chunks.push(Buffer.from(chunk))
      objects.set(key, Buffer.concat(chunks))
    }
  }
  client.statObject = async (_bucket: string, key: string) => {
    const bytes = objects.get(key)
    if (!bytes) throw missing('NoSuchKey')
    return { size: bytes.length }
  }
  client.getObject = async (_bucket: string, key: string) => {
    const bytes = objects.get(key)
    if (!bytes) throw missing('NoSuchKey')
    return Readable.from([bytes])
  }
  client.removeObject = async (_bucket: string, key: string) => {
    objects.delete(key)
  }
}
