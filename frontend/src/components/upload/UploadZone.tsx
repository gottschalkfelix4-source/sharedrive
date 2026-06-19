import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, Plus, FolderUp } from 'lucide-react'
import { cn, formatBytes, getFileIcon } from '@/lib/utils'

interface UploadZoneProps {
  files: File[]
  onFilesAdded: (files: File[]) => void
  onFileRemove: (index: number) => void
  maxSize?: number
}

// Forges webkitRelativePath onto Files pulled from drag-and-drop directory
// entries, so downstream code can read file.webkitRelativePath uniformly
// regardless of whether files came from drag-and-drop or a folder <input>.
function withRelativePath(file: File, path: string): File {
  Object.defineProperty(file, 'webkitRelativePath', { value: path, configurable: true })
  return file
}

async function readAllEntries(reader: any): Promise<any[]> {
  const entries: any[] = []
  for (;;) {
    const batch: any[] = await new Promise((resolve, reject) => reader.readEntries(resolve, reject))
    if (batch.length === 0) break
    entries.push(...batch)
  }
  return entries
}

async function walkEntry(entry: any, path: string): Promise<File[]> {
  if (entry.isFile) {
    const file: File = await new Promise((resolve, reject) => entry.file(resolve, reject))
    return [withRelativePath(file, path + file.name)]
  }
  if (entry.isDirectory) {
    const entries = await readAllEntries(entry.createReader())
    const nested = await Promise.all(entries.map((e) => walkEntry(e, `${path}${entry.name}/`)))
    return nested.flat()
  }
  return []
}

// Custom file extractor: when items support the File System Entries API
// (drag-and-drop of folders), walk directories recursively to preserve
// structure. Falls back to the plain file list otherwise.
async function getFilesFromEvent(event: any): Promise<File[]> {
  const items: any[] | undefined = event.dataTransfer?.items
  if (items && items.length > 0 && typeof items[0].webkitGetAsEntry === 'function') {
    const entries = Array.from(items)
      .map((item: any) => item.webkitGetAsEntry())
      .filter(Boolean)
    if (entries.length > 0) {
      const nested = await Promise.all(entries.map((entry: any) => walkEntry(entry, '')))
      return nested.flat()
    }
  }
  const fileList = event.dataTransfer?.files ?? event.target?.files
  return fileList ? Array.from(fileList) : []
}

export function UploadZone({ files, onFilesAdded, onFileRemove, maxSize }: UploadZoneProps) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      onFilesAdded(accepted)
    },
    [onFilesAdded]
  )

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    maxSize,
    multiple: true,
    getFilesFromEvent,
  })

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={cn(
          'relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300',
          'flex flex-col items-center justify-center gap-4',
          isDragActive && !isDragReject
            ? 'border-primary bg-primary/5 shadow-glow'
            : isDragReject
            ? 'border-red-500 bg-red-500/5'
            : 'border-border hover:border-border-strong hover:bg-white/[0.02]'
        )}
      >
        <input {...getInputProps()} />

        {/* Animated background glow when dragging */}
        <AnimatePresence>
          {isDragActive && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 rounded-2xl bg-gradient-radial from-primary/10 to-transparent pointer-events-none"
            />
          )}
        </AnimatePresence>

        <motion.div
          animate={{ scale: isDragActive ? 1.1 : 1 }}
          transition={{ type: 'spring', stiffness: 300 }}
          className={cn(
            'w-16 h-16 rounded-2xl flex items-center justify-center',
            isDragActive ? 'bg-primary/20 text-primary' : 'bg-white/5 text-text-muted'
          )}
        >
          <Upload size={28} />
        </motion.div>

        <div>
          <p className="text-lg font-semibold text-text-primary">
            {isDragActive ? 'Dateien hier ablegen' : 'Dateien hier ablegen'}
          </p>
          <p className="text-sm text-text-muted mt-1">
            oder <span className="text-primary">zum Durchsuchen klicken</span>
            {maxSize && ` · max ${formatBytes(maxSize)} pro Datei`}
          </p>
        </div>
      </div>

      {/* File list */}
      <AnimatePresence>
        {files.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2"
          >
            {files.map((file, i) => (
              <motion.div
                key={`${file.name}-${i}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-3 p-3 bg-bg-elevated rounded-xl border border-border group"
              >
                <span className="text-2xl flex-shrink-0">{getFileIcon(file.type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">
                    {(file as any).webkitRelativePath || file.name}
                  </p>
                  <p className="text-xs text-text-muted">{formatBytes(file.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onFileRemove(i)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-all"
                >
                  ✕
                </button>
              </motion.div>
            ))}

            <div className="flex gap-2">
              <label className="flex-1 flex items-center gap-2 p-3 rounded-xl border border-dashed border-border text-text-muted hover:border-border-strong hover:text-text-secondary cursor-pointer transition-colors text-sm">
                <Plus size={16} />
                Weitere Dateien
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => e.target.files && onFilesAdded(Array.from(e.target.files))}
                />
              </label>
              <label className="flex-1 flex items-center gap-2 p-3 rounded-xl border border-dashed border-border text-text-muted hover:border-border-strong hover:text-text-secondary cursor-pointer transition-colors text-sm">
                <FolderUp size={16} />
                Ordner hochladen
                <input
                  type="file"
                  multiple
                  // @ts-ignore — non-standard but supported attrs for folder selection
                  webkitdirectory="true"
                  directory="true"
                  className="hidden"
                  onChange={(e) => e.target.files && onFilesAdded(Array.from(e.target.files))}
                />
              </label>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
