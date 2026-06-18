// AES-256-GCM end-to-end encryption helpers.
// Each chunk is independently encrypted: [12B IV | ciphertext | 16B auth tag]
// The key is shared via the URL fragment (#key=<base64url>) — never sent to the server.

const ALGO = 'AES-GCM'
const IV_LEN = 12   // bytes — GCM standard nonce
const TAG_LEN = 16  // bytes — GCM auth tag (appended by subtle.encrypt)

export const CHUNK_SIZE = 8 * 1024 * 1024   // must match upload CHUNK_SIZE
export const ENC_OVERHEAD = IV_LEN + TAG_LEN // per chunk

export async function generateKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: ALGO, length: 256 }, true, ['encrypt', 'decrypt'])
}

export async function exportKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key)
  // base64url encoding (no padding)
  return btoa(String.fromCharCode(...new Uint8Array(raw)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

export async function importKey(base64url: string): Promise<CryptoKey> {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
  return crypto.subtle.importKey('raw', raw, { name: ALGO, length: 256 }, false, ['encrypt', 'decrypt'])
}

export async function encryptChunk(key: CryptoKey, plaintext: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN))
  const ciphertext = await crypto.subtle.encrypt({ name: ALGO, iv }, key, plaintext)
  const out = new Uint8Array(IV_LEN + ciphertext.byteLength)
  out.set(iv)
  out.set(new Uint8Array(ciphertext), IV_LEN)
  return out
}

export async function decryptChunk(key: CryptoKey, encData: Uint8Array): Promise<Uint8Array> {
  const iv = encData.slice(0, IV_LEN)
  const ciphertext = encData.slice(IV_LEN)
  const plain = await crypto.subtle.decrypt({ name: ALGO, iv }, key, ciphertext)
  return new Uint8Array(plain)
}

// In-memory decryption — suitable for files up to a few hundred MB
export async function decryptToBlob(
  key: CryptoKey,
  encryptedData: ArrayBuffer,
  plaintextSize: number,
): Promise<Blob> {
  const numChunks = Math.ceil(plaintextSize / CHUNK_SIZE)
  const src = new Uint8Array(encryptedData)
  const parts: Uint8Array[] = []
  let offset = 0

  for (let i = 0; i < numChunks; i++) {
    const plainLen = i < numChunks - 1 ? CHUNK_SIZE : plaintextSize - (numChunks - 1) * CHUNK_SIZE
    const encLen = plainLen + ENC_OVERHEAD
    parts.push(await decryptChunk(key, src.slice(offset, offset + encLen)))
    offset += encLen
  }

  return new Blob(parts)
}

// Streaming decryption via File System Access API (for large files > a few hundred MB)
export async function decryptStream(
  encryptedStream: ReadableStream<Uint8Array>,
  key: CryptoKey,
  plaintextSize: number,
  writable: WritableStream<Uint8Array>,
): Promise<void> {
  const numChunks = Math.ceil(plaintextSize / CHUNK_SIZE)
  const writer = writable.getWriter()
  const reader = encryptedStream.getReader()

  let buf = new Uint8Array(0)

  function append(data: Uint8Array) {
    const merged = new Uint8Array(buf.length + data.length)
    merged.set(buf)
    merged.set(data, buf.length)
    buf = merged
  }

  function encChunkLen(i: number): number {
    const plainLen = i < numChunks - 1 ? CHUNK_SIZE : plaintextSize - (numChunks - 1) * CHUNK_SIZE
    return plainLen + ENC_OVERHEAD
  }

  for (let i = 0; i < numChunks; i++) {
    const needed = encChunkLen(i)
    while (buf.length < needed) {
      const { done, value } = await reader.read()
      if (value) append(value)
      if (done) break
    }
    if (buf.length < needed) throw new Error('Encrypted stream ended unexpectedly')

    const chunk = buf.slice(0, needed)
    buf = buf.slice(needed)
    await writer.write(await decryptChunk(key, chunk))
  }

  await writer.close()
}
