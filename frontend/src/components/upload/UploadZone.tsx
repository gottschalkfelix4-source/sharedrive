import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, Plus, FileIcon } from 'lucide-react'
import { cn, formatBytes, getFileIcon } from '@/lib/utils'

interface UploadZoneProps {
  files: File[]
  onFilesAdded: (files: File[]) => void
  onFileRemove: (index: number) => void
  maxSize?: number
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
            {isDragActive ? 'Drop your files here' : 'Drop files here'}
          </p>
          <p className="text-sm text-text-muted mt-1">
            or <span className="text-primary">click to browse</span>
            {maxSize && ` · max ${formatBytes(maxSize)} per file`}
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
                  <p className="text-sm font-medium text-text-primary truncate">{file.name}</p>
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

            <label className="flex items-center gap-2 p-3 rounded-xl border border-dashed border-border text-text-muted hover:border-border-strong hover:text-text-secondary cursor-pointer transition-colors text-sm">
              <Plus size={16} />
              Add more files
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => e.target.files && onFilesAdded(Array.from(e.target.files))}
              />
            </label>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
