'use client'

import { useState, useTransition } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { KeyRound, RefreshCw, Copy, Check, ShieldCheck, AlertCircle } from 'lucide-react'
import { updateTeamCode, regenerateTeamCode } from './actions'

interface TeamCodeFormProps {
  organizationId: string
  organizationName: string
  initialTeamCode: string | null
}

export function TeamCodeForm({
  organizationId,
  organizationName,
  initialTeamCode,
}: TeamCodeFormProps) {
  const [currentCode, setCurrentCode] = useState<string>(initialTeamCode || 'NOT-SET')
  const [inputCode, setInputCode] = useState<string>(initialTeamCode || '')
  const [isCopied, setIsCopied] = useState<boolean>(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentCode)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    } catch {
      // Fallback
    }
  }

  const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
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
        setMessage({ text: 'Generated new Secret Team Code.', type: 'success' })
      }
    })
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
              <KeyRound className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-lg">Secret Team Code</CardTitle>
              <CardDescription>
                Employees use this secret code during registration to join {organizationName}.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {message && (
            <div
              className={`p-3 rounded-lg text-xs font-medium flex items-center gap-2 ${
                message.type === 'success'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                  : 'bg-destructive/10 text-destructive border border-destructive/20'
              }`}
            >
              {message.type === 'success' ? <ShieldCheck className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              <span>{message.text}</span>
            </div>
          )}

          {/* Active Code Box */}
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
                onClick={handleCopy}
              >
                {isCopied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{isCopied ? 'Copied!' : 'Copy Code'}</span>
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

          {/* Manual Update Form */}
          <form onSubmit={handleUpdate} className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <label htmlFor="customTeamCode" className="text-sm font-medium leading-none">
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
                className="font-mono uppercase tracking-wider"
                required
                minLength={4}
                maxLength={20}
              />
              <Button type="submit" disabled={isPending || inputCode === currentCode}>
                {isPending ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </form>
        </CardContent>

        <CardFooter className="border-t bg-muted/20 text-xs text-muted-foreground py-3">
          Regenerating or changing this code will not affect previously registered or approved employees.
        </CardFooter>
      </Card>
    </div>
  )
}
