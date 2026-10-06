import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  generateKey,
  exportKey,
  importKey,
  encryptChunk,
  decryptToBlob,
  decryptStream,
  encryptText,
  decryptText,
  metadataAAD,
  CHUNK_SIZE,
} from '../src/lib/e2e'

const context = {
  id: 'e712efae-434b-4d2f-8dc7-850cb85a8b3b',
  fileIndex: 0,
  plaintextSize: CHUNK_SIZE * 2,
}
const concatenate = (a: Uint8Array, b: Uint8Array) => {
  const out = new Uint8Array(a.length + b.length)
  out.set(a)
  out.set(b, a.length)
  return out.buffer
}
test('key and Unicode metadata round-trip; swapping metadata fields is rejected', async () => {
  const key = await importKey(await exportKey(await generateKey()))
  const encrypted = await encryptText(
    key,
    'Übertragung 日本語',
    metadataAAD(context.id, 'title')
  )
  assert.equal(
    await decryptText(key, encrypted, metadataAAD(context.id, 'title')),
    'Übertragung 日本語'
  )
  await assert.rejects(
    decryptText(key, encrypted, metadataAAD(context.id, 'message'))
  )
})
test('v2 chunks authenticate position, file, context and total plaintext length', async () => {
  const key = await generateKey()
  const a = await encryptChunk(
    key,
    new Uint8Array(CHUNK_SIZE).fill(11),
    context,
    0
  )
  const b = await encryptChunk(
    key,
    new Uint8Array(CHUNK_SIZE).fill(22),
    context,
    1
  )
  const blob = await decryptToBlob(
    key,
    concatenate(a, b),
    context.plaintextSize,
    undefined,
    context
  )
  const clear = new Uint8Array(await blob.arrayBuffer())
  assert.equal(clear[0], 11)
  assert.equal(clear[CHUNK_SIZE], 22)
  await assert.rejects(
    decryptToBlob(
      key,
      concatenate(b, a),
      context.plaintextSize,
      undefined,
      context
    )
  )
  for (const changed of [
    { ...context, fileIndex: 1 },
    { ...context, id: crypto.randomUUID() },
    { ...context, plaintextSize: context.plaintextSize - 1 },
  ])
    await assert.rejects(
      decryptToBlob(
        key,
        concatenate(a, b),
        changed.plaintextSize,
        undefined,
        changed
      )
    )
})
test('legacy encrypted files remain readable; truncated and trailing bytes fail', async () => {
  const key = await generateKey(),
    encrypted = await encryptChunk(key, new Uint8Array([1, 2, 3]))
  assert.deepEqual(
    new Uint8Array(
      await (
        await decryptToBlob(key, encrypted.buffer as ArrayBuffer, 3)
      ).arrayBuffer()
    ),
    new Uint8Array([1, 2, 3])
  )
  await assert.rejects(
    decryptToBlob(key, encrypted.slice(0, -1).buffer as ArrayBuffer, 3)
  )
  await assert.rejects(
    decryptToBlob(key, concatenate(encrypted, new Uint8Array([0])), 3)
  )
})
test('encrypted empty objects round-trip', async () => {
  const key = await generateKey(),
    emptyContext = { ...context, plaintextSize: 0 }
  const bytes = await encryptChunk(key, new Uint8Array(), emptyContext, 0)
  assert.equal(bytes.length, 28)
  assert.equal(
    (
      await decryptToBlob(
        key,
        bytes.buffer as ArrayBuffer,
        0,
        undefined,
        emptyContext
      )
    ).size,
    0
  )
})
test('stream integrity failures abort output and release reader/writer locks', async () => {
  const key = await generateKey(),
    ctx = { ...context, plaintextSize: 3 }
  const bytes = await encryptChunk(key, new Uint8Array([1, 2, 3]), ctx, 0)
  bytes[15] ^= 1
  let aborted = false,
    cancelled = false
  const readable = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(bytes)
    },
    cancel() {
      cancelled = true
    },
  })
  const writable = new WritableStream({
    abort() {
      aborted = true
    },
  })
  await assert.rejects(
    decryptStream(readable, key, 3, writable, undefined, ctx)
  )
  assert.ok(aborted)
  assert.ok(cancelled)
  assert.equal(readable.locked, false)
  assert.equal(writable.locked, false)
})
