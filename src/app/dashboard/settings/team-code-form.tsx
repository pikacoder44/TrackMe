'use client'

import { useState, useTransition } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  KeyRound,
  RefreshCw,
  Copy,
  Check,
  ShieldCheck,
  AlertCircle,
  Link as LinkIcon,
  Mail,
  UserCheck,
} from 'lucide-react'
import {
  updateTeamCode,
  regenerateTeamCode,
  toggleManagerApprovalAction,
  sendEmployeeInviteAction,
} from './actions'

interface TeamCodeFormProps {
  organizationId: string
  organizationName: string
  initialTeamCode: string | null
  initialRequireApproval?: boolean
}

export function TeamCodeForm({
  organizationId,
  organizationName,
  initialTeamCode,
  initialRequireApproval = true,
}: TeamCodeFormProps) {
  const [currentCode, setCurrentCode] = useState<string>(initialTeamCode || 'NOT-SET')
  const [inputCode, setInputCode] = useState<string>(initialTeamCode || '')
  const [isCopiedCode, setIsCopiedCode] = useState<boolean>(false)
  const [isCopiedLink, setIsCopiedLink] = useState<boolean>(false)
  const [requireApproval, setRequireApproval] = useState<boolean>(initialRequireApproval)
  const [inviteEmail, setInviteEmail] = useState<string>('')

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(currentCode)
      setIsCopiedCode(true)
      setTimeout(() => setIsCopiedCode(false), 2000)
    } catch {
      // Fallback
    }
  }

  const handleCopyJoinLink = async () => {
    if (typeof window === 'undefined' || currentCode === 'NOT-SET') return
    try {
      const fullJoinUrl = `${window.location.origin}/join/${currentCode}`
      await navigator.clipboard.writeText(fullJoinUrl)
      setIsCopiedLink(true)
      setTimeout(() => setIsCopiedLink(false), 2500)
    } catch {
      // Fallback
    }
  }

  const handleUpdateCode = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setMessage(null)
    const formData = new FormData()
    formData.append('organizationId', organizationId)
    formData.append('teamCode', inputCode)

    startTransition(async () => {
      const res = await updateTeamCode(formData)
      if (res?.error) {
        setMessage({ text: res.error, type: 'error' })
      } else if (res?.teamCode) {
        setCurrentCode(res.teamCode)
        setMessage({ text: 'Secret Team Code updated successfully.', type: 'success' })
      }
    })
  }

  const handleRegenerate = () => {
    setMessage(null)
    startTransition(async () => {
      const res = await regenerateTeamCode(organizationId)
      if (res?.error) {
        setMessage({ text: res.error, type: 'error' })
      } else if (res?.teamCode) {
        setCurrentCode(res.teamCode)
        setInputCode(res.teamCode)
        setMessage({ text: 'Generated new Secret Team Code and Join Link.', type: 'success' })
      }
    })
  }

  const handleToggleApproval = (newVal: boolean) => {
    setRequireApproval(newVal)
    startTransition(async () => {
      const res = await toggleManagerApprovalAction(organizationId, newVal)
      if (res?.error) {
        setRequireApproval(!newVal)
        setMessage({ text: res.error, type: 'error' })
      } else {
        setMessage({
          text: newVal
            ? 'Manager approval enabled: new joining employees must be approved in the Approvals queue.'
            : 'Manager approval disabled: new employees will be automatically approved upon registration.',
          type: 'success',
        })
      }
    })
  }

  const handleSendInvite = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!inviteEmail) return
    setMessage(null)

    startTransition(async () => {
      const res = await sendEmployeeInviteAction(organizationId, inviteEmail)
      if (res?.error) {
        setMessage({ text: res.error, type: 'error' })
      } else {
        setMessage({ text: res.message || `Invitation sent to ${inviteEmail}`, type: 'success' })
        setInviteEmail('')
      }
    })
  }

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`p-3.5 rounded-xl text-xs font-medium flex items-center justify-between border shadow-sm ${
            message.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/30'
              : 'bg-destructive/10 text-destructive border-destructive/20'
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === 'success' ? (
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
          <button
            onClick={() => setMessage(null)}
            className="text-[11px] font-semibold uppercase opacity-70 hover:opacity-100"
          >
            Close
          </button>
        </div>
      )}

      {/* 1. Team Join Link & Onboarding Card */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
              <LinkIcon className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-lg">Team Join Link & Email Invites</CardTitle>
              <CardDescription>
                Share this direct onboarding link with new team members or send email invitations.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Direct Link Display */}
          <div className="p-4 rounded-xl border bg-muted/40 space-y-2">
            <span className="text-xs uppercase font-semibold text-muted-foreground tracking-wider">
              Permanent Team Join Route
            </span>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="flex-1 bg-background px-3 py-2 rounded-lg border font-mono text-xs text-foreground truncate select-all">
                {currentCode !== 'NOT-SET' ? `/join/${currentCode}` : 'Code Not Set'}
              </div>
              <Button
                variant="default"
                size="sm"
                className="gap-1.5 text-xs h-9 shrink-0"
                onClick={handleCopyJoinLink}
                disabled={currentCode === 'NOT-SET'}
              >
                {isCopiedLink ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{isCopiedLink ? 'Full Link Copied!' : 'Copy Join Link'}</span>
              </Button>
            </div>
          </div>

          {/* Quick Email Invite */}
          <form onSubmit={handleSendInvite} className="space-y-2">
            <label htmlFor="inviteEmail" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Direct Employee Invite
            </label>
            <div className="flex gap-2 max-w-lg">
              <div className="relative flex-1">
                <Input
                  id="inviteEmail"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="employee@company.com"
                  className="pl-9 h-10 text-xs"
                  required
                />
                <Mail className="w-4 h-4 text-muted-foreground absolute left-3 top-3 pointer-events-none" />
              </div>
              <Button type="submit" size="sm" className="h-10 text-xs px-4" disabled={isPending}>
                {isPending ? 'Sending...' : 'Send Invite'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 2. Optional Manager Approval Toggle Card */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
              <UserCheck className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-lg">Employee Approval Policy</CardTitle>
              <CardDescription>
                Control whether employees can track time immediately or require manual manager authorization.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between gap-4 p-4 rounded-xl border bg-muted/40">
            <div className="space-y-1">
              <div className="font-semibold text-sm text-foreground flex items-center gap-2">
                <span>Require Manager Approval for Joining Employees</span>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                    requireApproval
                      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30'
                      : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                  }`}
                >
                  {requireApproval ? 'Enabled' : 'Auto-Approve Active'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
                When enabled, newly registered employees remain in a <strong>Pending</strong> state and are blocked from clocking in until approved in your <em>Approvals</em> tab. When disabled, employees are instantly approved.
              </p>
            </div>

            <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
              <input
                type="checkbox"
                checked={requireApproval}
                onChange={(e) => handleToggleApproval(e.target.checked)}
                disabled={isPending}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary border border-border"></div>
            </label>
          </div>
        </CardContent>
      </Card>

      {/* 3. Secret Team Code Configuration */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
              <KeyRound className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-lg">Secret Team Code</CardTitle>
              <CardDescription>
                Manual verification code for {organizationName} if joining without a direct link.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="p-4 rounded-xl border bg-muted/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-xs uppercase font-medium text-muted-foreground tracking-wider">
                Current Active Code
              </span>
              <div className="text-2xl font-mono font-bold tracking-widest text-primary">
                {currentCode}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs h-9"
                onClick={handleCopyCode}
              >
                {isCopiedCode ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{isCopiedCode ? 'Copied!' : 'Copy Code'}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs h-9"
                disabled={isPending}
                onClick={handleRegenerate}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} />
                <span>Regenerate</span>
              </Button>
            </div>
          </div>

          <form onSubmit={handleUpdateCode} className="space-y-3 pt-1">
            <div className="space-y-1">
              <label htmlFor="customTeamCode" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Customize Team Code
              </label>
              <p className="text-xs text-muted-foreground">
                Enter custom alphanumeric characters (e.g. TRACK-PROD or DEV-9021).
              </p>
            </div>
            <div className="flex gap-2 max-w-md">
              <Input
                id="customTeamCode"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                placeholder="TRACK-XXXX"
                className="font-mono uppercase tracking-wider h-10 text-xs"
                required
                minLength={4}
                maxLength={20}
              />
              <Button type="submit" size="sm" className="h-10 text-xs" disabled={isPending || inputCode === currentCode}>
                {isPending ? 'Saving...' : 'Save Code'}
              </Button>
            </div>
          </form>
        </CardContent>
        <CardFooter className="border-t bg-muted/20 text-xs text-muted-foreground py-3">
          Regenerating or updating this code automatically updates the Team Join Link without affecting existing members.
        </CardFooter>
      </Card>
    </div>
  )
}
