'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { login } from '@/app/auth/actions'

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
    <div className="flex min-h-screen items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-sm shadow-lg border-border/60">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-7 w-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
              T
            </div>
            <span className="font-semibold text-lg tracking-tight">TrackMe</span>
          </div>
          <CardTitle className="text-xl">Sign in to TrackMe</CardTitle>
          <CardDescription>Enter your username and password to continue</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="text-sm font-medium text-destructive bg-destructive/10 p-2.5 rounded-md border border-destructive/20">
                {error}
              </div>
            )}
            <div className="space-y-1.5">
              <label htmlFor="username" className="text-sm font-medium leading-none">
                Username
              </label>
              <Input
                id="username"
                name="username"
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="e.g. alex.chen"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium leading-none">
                Password
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                required
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3 pt-2">
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? 'Signing in...' : 'Sign In'}
            </Button>
            <div className="text-xs text-muted-foreground text-center space-y-1">
              <p>
                Need to join a team?{' '}
                <Link href="/register" className="text-primary font-medium underline-offset-4 hover:underline">
                  Register with Team Code
                </Link>
              </p>
              <p>
                <Link href="/" className="text-muted-foreground hover:text-foreground">
                  ← Back to Home
                </Link>
              </p>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
