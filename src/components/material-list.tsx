'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { createClient } from '@/lib/supabase/client'
import { deleteMaterial } from '@/lib/actions/materials'

export type MaterialWithStatus = {
  id: string
  file_name: string
  file_type: string
  file_size_bytes: number | null
  created_at: string
  parseJob: {
    id: string
    status: string
    progressPercent: number
    currentStep: string | null
    errorMessage: string | null
  } | null
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return 'Unknown size'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1_048_576).toFixed(1)} MB`
}

function fileTypeLabel(mime: string): string {
  if (mime === 'application/pdf') return 'PDF'
  if (mime.includes('wordprocessingml')) return 'DOCX'
  if (mime.includes('presentationml')) return 'PPTX'
  if (mime === 'image/png') return 'PNG'
  if (mime === 'image/jpeg') return 'JPEG'
  return 'File'
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'pending':
      return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Pending</Badge>
    case 'running':
      return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Processing</Badge>
    case 'completed':
      return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Parsed</Badge>
    case 'failed':
      return <Badge variant="destructive">Failed</Badge>
    case 'cancelled':
      return <Badge variant="secondary">Cancelled</Badge>
    default:
      return <Badge variant="secondary">{status}</Badge>
  }
}

export function MaterialList({
  courseId,
  courseSlug,
  initialMaterials,
  planStatus,
  allParsed,
}: {
  courseId: string
  courseSlug: string
  initialMaterials: MaterialWithStatus[]
  planStatus: 'draft' | 'approved' | 'generating' | 'completed' | null
  allParsed: boolean
}) {
  const [materials, setMaterials] = useState<MaterialWithStatus[]>(initialMaterials)
  const [deleting, setDeleting] = useState<string | null>(null)

  // Subscribe to realtime job updates
  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel(`parse-jobs-${courseId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'generation_jobs',
          filter: `course_id=eq.${courseId}`,
        },
        (payload) => {
          const updated = payload.new as {
            id: string
            status: string
            progress_percent: number
            current_step: string | null
            error_message: string | null
            input_payload: { source_material_id?: string } | null
          }

          const materialId =
            updated.input_payload?.source_material_id
          if (!materialId) return

          setMaterials((prev) =>
            prev.map((m) =>
              m.id === materialId
                ? {
                    ...m,
                    parseJob: {
                      id: updated.id,
                      status: updated.status,
                      progressPercent: updated.progress_percent,
                      currentStep: updated.current_step,
                      errorMessage: updated.error_message,
                    },
                  }
                : m
            )
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [courseId])

  const handleDelete = useCallback(async (materialId: string, fileName: string) => {
    if (!confirm(`Delete "${fileName}"? This will also remove parsed content.`)) return

    setDeleting(materialId)
    const result = await deleteMaterial(materialId)
    setDeleting(null)

    if (result.success) {
      setMaterials((prev) => prev.filter((m) => m.id !== materialId))
      toast.success(`Deleted "${fileName}".`)
    } else {
      toast.error(`Failed to delete: ${result.error}`)
    }
  }, [])

  if (materials.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No materials uploaded yet. Upload a PDF, DOCX, or PPTX to get started.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Uploaded Materials</h2>
      {materials.map((material) => (
        <Card key={material.id}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Badge variant="secondary">{fileTypeLabel(material.file_type)}</Badge>
                <span className="font-medium truncate">{material.file_name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {material.parseJob && <StatusBadge status={material.parseJob.status} />}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(material.id, material.file_name)}
                  disabled={deleting === material.id}
                  className="text-muted-foreground hover:text-destructive"
                >
                  {deleting === material.id ? 'Deleting...' : 'Delete'}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>{formatFileSize(material.file_size_bytes)}</span>
              <span>{new Date(material.created_at).toLocaleDateString()}</span>
            </div>

            {material.parseJob?.status === 'running' && (
              <div className="mt-3 space-y-1">
                <Progress value={material.parseJob.progressPercent} className="h-2" />
                {material.parseJob.currentStep && (
                  <p className="text-xs text-muted-foreground">
                    {material.parseJob.currentStep}
                  </p>
                )}
              </div>
            )}

            {material.parseJob?.status === 'failed' && material.parseJob.errorMessage && (
              <p className="mt-2 text-xs text-destructive">
                {material.parseJob.errorMessage}
              </p>
            )}
          </CardContent>
        </Card>
      ))}

      {allParsed && planStatus === null && (
        <Card>
          <CardContent className="py-4 text-center text-sm text-muted-foreground">
            Materials parsed. Plan being proposed...
          </CardContent>
        </Card>
      )}

      {allParsed && planStatus === 'draft' && (
        <Card>
          <CardContent className="py-4 text-center text-sm">
            <Link
              href={`/professor/courses/${courseSlug}/plan`}
              className="font-medium text-primary hover:underline"
            >
              Plan ready for review →
            </Link>
          </CardContent>
        </Card>
      )}

      {allParsed &&
        (planStatus === 'generating' ||
          planStatus === 'completed' ||
          planStatus === 'approved') && (
          <Card>
            <CardContent className="py-4 text-center text-sm">
              <Link
                href={`/professor/courses/${courseSlug}/plan`}
                className="font-medium text-primary hover:underline"
              >
                Generation in progress →
              </Link>
            </CardContent>
          </Card>
        )}
    </div>
  )
}
