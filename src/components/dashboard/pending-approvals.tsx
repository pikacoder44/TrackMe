'use client'

import { useState, useTransition } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check, X, UserCheck, AlertCircle } from 'lucide-react'
import { approveEmployee, rejectEmployee } from '@/app/dashboard/actions'

export interface PendingMember {
  id: string
  userId: string
  fullName: string
  username: string
  email: string
  createdAt: string
}

interface PendingApprovalsProps {
  pendingMembers: PendingMember[]
}

export function PendingApprovals({ pendingMembers: initialMembers }: PendingApprovalsProps) {
  const [members, setMembers] = useState<PendingMember[]>(initialMembers)
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ id: string; message: string; type: 'success' | 'error' } | null>(null)

  if (members.length === 0) {
    return null
  }

  const handleApprove = (memberId: string) => {
    setFeedback(null)
    startTransition(async () => {
      const res = await approveEmployee(memberId)
      if (res?.error) {
        setFeedback({ id: memberId, message: res.error, type: 'error' })
      } else {
        setMembers((prev) => prev.filter((m) => m.id !== memberId))
        setFeedback({ id: memberId, message: 'Employee approved successfully! Extension access unlocked.', type: 'success' })
      }
    })
  }

  const handleReject = (memberId: string) => {
    setFeedback(null)
    startTransition(async () => {
      const res = await rejectEmployee(memberId)
      if (res?.error) {
        setFeedback({ id: memberId, message: res.error, type: 'error' })
      } else {
        setMembers((prev) => prev.filter((m) => m.id !== memberId))
        setFeedback({ id: memberId, message: 'Employee request rejected.', type: 'success' })
      }
    })
  }

  return (
    <Card className="border-amber-500/40 bg-amber-500/5 shadow-sm overflow-hidden mb-6">
      <CardHeader className="pb-3 border-b border-amber-500/20 bg-amber-500/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center">
              <UserCheck className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base text-amber-950 dark:text-amber-100 flex items-center gap-2">
                Pending Employee Approvals
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-200">
                  {members.length} awaiting review
                </span>
              </CardTitle>
              <CardDescription className="text-xs text-amber-900/80 dark:text-amber-300">
                These employees registered using your Secret Team Code. Approving unlocks their browser extension access.
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4 divide-y divide-border/60">
        {feedback && (
          <div
            className={`mb-4 p-3 rounded-lg text-xs font-medium flex items-center gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                : 'bg-destructive/10 text-destructive border border-destructive/20'
            }`}
          >
            {feedback.type === 'success' ? <UserCheck className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            <span>{feedback.message}</span>
          </div>
        )}

        <div className="space-y-3 pt-1">
          {members.map((m) => (
            <div key={m.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 first:pt-0">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{m.fullName}</span>
                  <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    @{m.username}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{m.email}</span>
                  <span>•</span>
                  <span>Joined {new Date(m.createdAt).toLocaleDateString()}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="default"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs gap-1 shadow-sm"
                  disabled={isPending}
                  onClick={() => handleApprove(m.id)}
                >
                  <Check className="h-3.5 w-3.5" />
                  Approve Access
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs text-destructive hover:bg-destructive/10 gap-1 border-destructive/30"
                  disabled={isPending}
                  onClick={() => handleReject(m.id)}
                >
                  <X className="h-3.5 w-3.5" />
                  Reject
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
