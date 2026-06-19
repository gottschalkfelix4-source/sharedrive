import net from 'net'
import { config } from '../config'

export interface ScanResult {
  clean: boolean
  virus?: string
  error?: string
}

const SCAN_TIMEOUT_MS = 10 * 60 * 1000 // large files can take a while to stream + scan

// Scans a readable stream via clamd's INSTREAM protocol:
// zINSTREAM\0, then <4-byte BE length><chunk> pairs, terminated by a zero-length chunk.
// Response is "stream: OK", "stream: <name> FOUND", or "stream: <reason> ERROR".
export function scanReadable(
  source: NodeJS.ReadableStream,
  onProgress?: (scannedBytes: number) => void
): Promise<ScanResult> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: config.clamav.host, port: config.clamav.port })
    let responseBuf = ''
    let scanned = 0
    let settled = false

    const finish = (result: ScanResult) => {
      if (settled) return
      settled = true
      source.removeAllListeners('data')
      source.removeAllListeners('end')
      source.removeAllListeners('error');
      (source as unknown as { destroy?: () => void }).destroy?.()
      socket.destroy()
      resolve(result)
    }

    socket.setTimeout(SCAN_TIMEOUT_MS, () => {
      finish({ clean: false, error: 'Virenscanner-Timeout' })
    })

    socket.on('error', (err) => {
      finish({ clean: false, error: `Virenscanner nicht erreichbar (${err.message})` })
    })

    socket.on('connect', () => {
      socket.write('zINSTREAM\0')

      source.on('data', (chunk: Buffer) => {
        if (settled) return
        ;(source as unknown as { pause?: () => void }).pause?.()
        const lenBuf = Buffer.alloc(4)
        lenBuf.writeUInt32BE(chunk.length, 0)
        socket.write(Buffer.concat([lenBuf, chunk]), () => {
          if (settled) return
          scanned += chunk.length
          onProgress?.(scanned)
          ;(source as unknown as { resume?: () => void }).resume?.()
        })
      })

      source.on('end', () => {
        if (settled) return
        socket.write(Buffer.alloc(4)) // zero-length chunk = EOF
      })

      source.on('error', (err: Error) => {
        finish({ clean: false, error: err.message })
      })
    })

    socket.on('data', (data) => {
      responseBuf += data.toString('utf8')
      if (!responseBuf.includes('\0') && !responseBuf.includes('\n')) return
      const line = responseBuf.replace(/\0/g, '').trim()

      if (/\bOK$/.test(line)) {
        finish({ clean: true })
      } else if (line.includes('FOUND')) {
        const m = line.match(/stream:\s*(.+?)\s+FOUND/)
        finish({ clean: false, virus: m?.[1] || 'Unbekannte Bedrohung' })
      } else if (line.includes('ERROR')) {
        finish({ clean: false, error: line.replace(/^stream:\s*/, '') })
      }
    })

    socket.on('close', () => {
      finish({ clean: false, error: 'Verbindung zum Virenscanner unterbrochen' })
    })
  })
}
