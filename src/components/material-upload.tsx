'use client'

import { useState, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { uploadMaterial } from '@/lib/actions/materials'

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png',
  'image/jpeg',
]

const ACCEPTED_EXTENSIONS = '.pdf,.docx,.pptx,.png,.jpg,.jpeg'
const MAX_SIZE_BYTES = 52_428_800 // 50MB

function fileTypeLabel(mime: string): string {
  if (mime === 'application/pdf') return 'PDF'
  if (mime.includes('wordprocessingml')) return 'DOCX'
  if (mime.includes('presentationml')) return 'PPTX'
  if (mime === 'image/png') return 'PNG'
  if (mime === 'image/jpeg') return 'JPEG'
  return 'File'
}

export function MaterialUpload({ courseId }: { courseId: string }) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const validateFile = useCallback((file: File): string | null => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return `Invalid file type: ${file.type || 'unknown'}. Accepted: PDF, DOCX, PPTX, PNG, JPEG.`
    }
    if (file.size > MAX_SIZE_BYTES) {
      return `File too large (${(file.size / 1_048_576).toFixed(1)}MB). Maximum is 50MB.`
    }
    return null
  }, [])

  const handleUpload = useCallback(
    async (file: File) => {
      const validationError = validateFile(file)
      if (validationError) {
        toast.error(validationError)
        return
      }

      setUploading(true)

      try {
        const supabase = createClient()
        const uuid = crypto.randomUUID()
        const storagePath = `${courseId}/${uuid}/${file.name}`

        // Upload to Supabase Storage
        const { error: storageError } = await supabase.storage
          .from('source-materials')
          .upload(storagePath, file)

        if (storageError) {
          throw new Error(`Storage upload failed: ${storageError.message}`)
        }

        // Record metadata via server action
        const formData = new FormData()
        formData.set('courseId', courseId)
        formData.set('fileName', file.name)
        formData.set('fileType', file.type)
        formData.set('storagePath', storagePath)
        formData.set('fileSizeBytes', String(file.size))

        const result = await uploadMaterial(formData)

        if (!result.success) {
          throw new Error(result.error)
        }

        toast.success(`Uploaded ${file.name} — parsing started.`)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Upload failed')
      } finally {
        setUploading(false)
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      }
    },
    [courseId, validateFile]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) handleUpload(file)
    },
    [handleUpload]
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleUpload(file)
    },
    [handleUpload]
  )

  return (
    <Card>
      <CardContent className="pt-6">
        <div
          role="button"
          tabIndex={0}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click()
          }}
          className={`
            border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
            ${isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}
            ${uploading ? 'pointer-events-none opacity-60' : ''}
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            onChange={handleFileSelect}
            className="hidden"
          />

          {uploading ? (
            <div className="space-y-2">
              <div className="animate-pulse text-muted-foreground">Uploading...</div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Drag and drop a file here, or click to browse
              </p>
              <p className="text-xs text-muted-foreground">
                PDF, DOCX, PPTX, PNG, or JPEG up to 50MB
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
