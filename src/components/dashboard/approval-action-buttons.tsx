'use client'

import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { approveTimeEntry, rejectTimeEntry } from '@/app/dashboard/approvals/actions'

interface ApprovalActionButtonsProps {
  entryId: string
  organizationId: string
}

export function ApprovalActionButtons({ entryId, organizationId }: ApprovalActionButtonsProps) {
  const [isPending, startTransition] = useTransition()

  function handleApprove() {
    startTransition(async () => {
      await approveTimeEntry(entryId, organizationId)
    })
  }

  function handleReject() {
    startTransition(async () => {
      await rejectTimeEntry(entryId, organizationId)
    })
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        className="text-destructive hover:bg-destructive/10"
        disabled={isPending}
        onClick={handleReject}
      >
        Reject
      </Button>
      <Button
        size="sm"
        disabled={isPending}
        onClick={handleApprove}
      >
        Approve
      </Button>
    </div>
  )
}
