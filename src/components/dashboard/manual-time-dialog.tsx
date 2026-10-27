'use client'

import { useState, useTransition } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { logManualTimeEntry } from '@/app/dashboard/actions'

interface Project {
  id: string
  name: string
}

interface ManualTimeDialogProps {
  organizationId: string
  projects: Project[]
}

export function ManualTimeDialog({ organizationId, projects }: ManualTimeDialogProps) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const formData = new FormData(event.currentTarget)
    formData.append('organizationId', organizationId)

    startTransition(async () => {
      const res = await logManualTimeEntry(formData)
      if (res?.error) {
        setError(res.error)
      } else {
        setOpen(false)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm">Log Time</Button>} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log Time Manually</DialogTitle>
          <DialogDescription>
            Record work completed offline or outside automated session tracking.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="text-sm font-medium text-destructive bg-destructive/10 p-2.5 rounded-md">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="modal-projectId" className="text-sm font-medium">
              Project
            </label>
            <select
              id="modal-projectId"
              name="projectId"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">No Project (General)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="durationHours" className="text-sm font-medium">
              Duration (Hours)
            </label>
            <Input
              id="durationHours"
              name="durationHours"
              type="number"
              step="0.25"
              min="0.25"
              placeholder="1.5"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="description" className="text-sm font-medium">
              Description
            </label>
            <Input
              id="description"
              name="description"
              placeholder="What did you work on?"
              required
            />
          </div>

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Logging...' : 'Save Entry'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
