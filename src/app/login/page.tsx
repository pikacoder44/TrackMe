'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { login } from '@/app/auth/actions'
import { ArrowRight, KeyRound, User } from 'lucide-react'

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const formData = new FormData(event.currentTarget)
    startTransition(async () => {
      const res = await login(formData)
      if (res?.error) setError(res.error)
    })
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-muted/20 relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(120,119,198,0.12),rgba(255,255,255,0))]" />

      <Card className="w-full max-w-md shadow-xl border-border/60 backdrop-blur-sm bg-card/95">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shadow-sm group-hover:scale-105 transition-transform duration-300">
                T
              </div>
              <span className="font-semibold text-lg tracking-tight">TrackMe</span>
            </Link>
            <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase bg-muted px-2.5 py-1 rounded-full border">
              Unified Auth
            </span>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight pt-2">Sign In</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            Access Super Admin, Manager Dashboard, or Employee controls
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="text-sm font-medium text-destructive bg-destructive/10 p-3 rounded-lg border border-destructive/20 animate-in fade-in">
                {error}
              </div>
            )}
            <div className="space-y-1.5">
              <label htmlFor="username" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Username or Work Email
              </label>
              <div className="relative">
                <Input
                  id="username"
                  name="username"
                  type="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="admin@trackme.io or username"
                  required
                  className="pl-9 h-11"
                />
                <User className="w-4 h-4 text-muted-foreground absolute left-3 top-3.5 pointer-events-none" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Password
              </label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  required
                  className="pl-9 h-11"
                />
                <KeyRound className="w-4 h-4 text-muted-foreground absolute left-3 top-3.5 pointer-events-none" />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4 pt-2">
            <Button
              type="submit"
              className="w-full h-11 font-medium text-sm transition-all duration-300"
              disabled={isPending}
            >
              {isPending ? 'Authenticating...' : 'Sign In to TrackMe'}
              {!isPending && <ArrowRight className="w-4 h-4 ml-2" />}
            </Button>

            <div className="text-xs text-muted-foreground text-center space-y-2">
              <p>
                Invited to a team?{' '}
                <Link
                  href="/register"
                  className="text-primary font-medium hover:underline underline-offset-4"
                >
                  Join with Team Code or Link
                </Link>
              </p>
              <p>
                <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
                  Back to Home
                </Link>
              </p>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
