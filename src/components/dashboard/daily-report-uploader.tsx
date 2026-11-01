'use client'

import { useState, useTransition, useRef } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  FileUp,
  FileCheck,
  CheckCircle2,
  Download,
  Clock,
} from 'lucide-react'
import { uploadDailyReportAction } from '@/app/dashboard/actions'

interface DailyReportUploaderProps {
  organizationId: string
  todayReport?: {
    id: string
    fileName: string
    fileUrl: string
    createdAt: string
  } | null
}

export function DailyReportUploader({
  organizationId,
  todayReport,
}: DailyReportUploaderProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadedReport, setUploadedReport] = useState(todayReport)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0])
    }
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!selectedFile) return
    setMessage(null)

    const formData = new FormData()
    formData.append('organizationId', organizationId)
    formData.append('reportFile', selectedFile)

    startTransition(async () => {
      const res = await uploadDailyReportAction(formData)
      if (res.error) {
        setMessage({ type: 'error', text: res.error })
      } else {
        setMessage({
          type: 'success',
          text: `Daily report "${res.fileName}" uploaded successfully.`,
        })
        setUploadedReport({
          id: 'temp-' + Date.now(),
          fileName: res.fileName!,
          fileUrl: URL.createObjectURL(selectedFile),
          createdAt: new Date().toISOString(),
        })
        setSelectedFile(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    })
  }

  return (
    <Card className="border-border/60 shadow-sm overflow-hidden bg-card/95">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
              <FileUp className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-base font-bold">Daily Executive Report Submission</CardTitle>
              <CardDescription className="text-xs">
                Upload today&#39;s team progress report (.docx, .pdf, or .xlsx) for Super Admin executive review.
              </CardDescription>
            </div>
          </div>

          <div>
            {uploadedReport ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Report Uploaded Today
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                Pending Today&#39;s Submission
              </span>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-1">
        {message && (
          <div
            className={`p-3 rounded-lg text-xs font-medium flex items-center justify-between border ${
              message.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 border-emerald-500/30'
                : 'bg-destructive/10 text-destructive border-destructive/20'
            }`}
          >
            <span>{message.text}</span>
            <button
              onClick={() => setMessage(null)}
              className="text-[10px] font-semibold uppercase opacity-70 hover:opacity-100"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Existing Report Download Banner if present */}
        {uploadedReport && (
          <div className="p-3 rounded-lg border bg-muted/40 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 truncate">
              <FileCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <div className="truncate">
                <span className="font-semibold text-foreground">{uploadedReport.fileName}</span>
                <span className="text-muted-foreground ml-2 text-[11px]">
                  (Submitted {new Date(uploadedReport.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                </span>
              </div>
            </div>

            <a
              href={uploadedReport.fileUrl}
              download={uploadedReport.fileName}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0"
            >
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                <Download className="w-3.5 h-3.5" />
                Download
              </Button>
            </a>
          </div>
        )}

        {/* Upload Form */}
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex-1">
            <input
              ref={fileInputRef}
              type="file"
              id="reportFile"
              name="reportFile"
              accept=".docx,.doc,.pdf,.xlsx,.csv"
              onChange={handleFileChange}
              className="block w-full text-xs text-muted-foreground file:mr-3 file:py-2 file:px-3 file:rounded-md file:border file:border-border file:text-xs file:font-semibold file:bg-muted file:text-foreground hover:file:bg-muted/80 cursor-pointer"
              required
            />
          </div>

          <Button
            type="submit"
            size="sm"
            className="h-9 text-xs px-4 shrink-0 font-medium"
            disabled={isPending || !selectedFile}
          >
            {isPending ? 'Uploading...' : uploadedReport ? 'Replace Report' : 'Upload Daily Report'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
