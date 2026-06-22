// AES-256-GCM end-to-end encryption helpers.
// Each chunk is independently encrypted: [12B IV | ciphertext | 16B auth tag]
// The key is shared via the URL fragment (#key=<base64url>) — never sent to the server.
//
// All Uint8Array values are explicitly typed as Uint8Array<ArrayBuffer> to satisfy
// TypeScript 5.3+'s stricter BufferSource checks on the Web Crypto API.

const ALGO = 'AES-GCM'
const IV_LEN = 12   // bytes — GCM standard nonce
const TAG_LEN = 16  // bytes — GCM auth tag (appended by subtle.encrypt)

export const CHUNK_SIZE = 8 * 1024 * 1024   // must match upload CHUNK_SIZE
export const ENC_OVERHEAD = IV_LEN + TAG_LEN // per chunk

export async function generateKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: ALGO, length: 256 }, true, ['encrypt', 'decrypt'])
}

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function fromBase64Url(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  const chars = atob(padded)
  // new Uint8Array(length) produces Uint8Array<ArrayBuffer> — required by subtle.importKey
  const raw = new Uint8Array(chars.length)
  for (let i = 0; i < chars.length; i++) raw[i] = chars.charCodeAt(i)
  return raw
}

export async function exportKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key)
  return toBase64Url(new Uint8Array(raw))
}

export async function importKey(base64url: string): Promise<CryptoKey> {
  const raw = fromBase64Url(base64url)
  return crypto.subtle.importKey('raw', raw, { name: ALGO, length: 256 }, false, ['encrypt', 'decrypt'])
}

// Encrypt a short UTF-8 string (filename, title, message) — used so metadata
// is just as opaque to the server/DB as the file content itself.
export async function encryptText(key: CryptoKey, text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const enc = await encryptChunk(key, bytes as Uint8Array<ArrayBuffer>)
  return toBase64Url(enc)
}

export async function decryptText(key: CryptoKey, base64url: string): Promise<string> {
  const enc = fromBase64Url(base64url)
  const dec = await decryptChunk(key, enc)
  return new TextDecoder().decode(dec)
}

export async function encryptChunk(key: CryptoKey, plaintext: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  // getRandomValues with Uint8Array<ArrayBuffer> returns Uint8Array<ArrayBuffer>
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN))
  const ciphertext = await crypto.subtle.encrypt({ name: ALGO, iv }, key, plaintext)
  const out = new Uint8Array(IV_LEN + ciphertext.byteLength)
  out.set(iv)
  out.set(new Uint8Array(ciphertext), IV_LEN)
  return out
}

export async function decryptChunk(key: CryptoKey, encData: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  // .slice() on Uint8Array<ArrayBuffer> returns Uint8Array<ArrayBuffer>
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
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  const numChunks = Math.ceil(plaintextSize / CHUNK_SIZE)
  // new Uint8Array(ArrayBuffer) → Uint8Array<ArrayBuffer>
  const src = new Uint8Array(encryptedData)
  const parts: Uint8Array<ArrayBuffer>[] = []
  let offset = 0

  for (let i = 0; i < numChunks; i++) {
    const plainLen = i < numChunks - 1 ? CHUNK_SIZE : plaintextSize - (numChunks - 1) * CHUNK_SIZE
    const encLen = plainLen + ENC_OVERHEAD
    // src.slice() → Uint8Array<ArrayBuffer>
    parts.push(await decryptChunk(key, src.slice(offset, offset + encLen)))
    offset += encLen
    onProgress?.(Math.round(((i + 1) / numChunks) * 100))
  }

  return new Blob(parts)
}

// Streaming decryption via File System Access API (for large files)
export async function decryptStream(
  encryptedStream: ReadableStream<Uint8Array>,
  key: CryptoKey,
  plaintextSize: number,
  writable: WritableStream<Uint8Array>,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const numChunks = Math.ceil(plaintextSize / CHUNK_SIZE)
  const writer = writable.getWriter()
  const reader = encryptedStream.getReader()

  // buf is always backed by a fresh ArrayBuffer (new Uint8Array → Uint8Array<ArrayBuffer>)
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

    // buf.slice() → Uint8Array<ArrayBuffer>
    const chunk = buf.slice(0, needed)
    buf = buf.slice(needed)
    await writer.write(await decryptChunk(key, chunk))
    onProgress?.(Math.round(((i + 1) / numChunks) * 100))
  }

  await writer.close()
}
