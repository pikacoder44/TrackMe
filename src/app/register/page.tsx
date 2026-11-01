'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { register } from '@/app/auth/actions'

export default function RegisterPage() {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const formData = new FormData(event.currentTarget)
    startTransition(async () => {
      const res = await register(formData)
      if (res?.error) setError(res.error)
    })
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-md shadow-lg border-border/60">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-7 w-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
              T
            </div>
            <span className="font-semibold text-lg tracking-tight">TrackMe</span>
          </div>
          <CardTitle className="text-xl">Join Your Organization</CardTitle>
          <CardDescription>
            Enter your employee credentials and Secret Team Code to register.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="text-sm font-medium text-destructive bg-destructive/10 p-2.5 rounded-md border border-destructive/20">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="firstName" className="text-sm font-medium leading-none">
                  First Name
                </label>
                <Input id="firstName" name="firstName" placeholder="Alex" required />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="lastName" className="text-sm font-medium leading-none">
                  Last Name
                </label>
                <Input id="lastName" name="lastName" placeholder="Chen" required />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium leading-none">
                Work Email
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="alex.chen@company.com"
                required
              />
            </div>

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
                placeholder="alex.chen"
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
                minLength={6}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="teamCode" className="text-sm font-medium leading-none">
                  Team Secret Code
                </label>
                <span className="text-[11px] text-muted-foreground">Provided by manager</span>
              </div>
              <Input
                id="teamCode"
                name="teamCode"
                type="text"
                className="font-mono uppercase tracking-wider"
                placeholder="TRACK-XXXX"
                required
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3 pt-2">
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? 'Registering...' : 'Complete Registration'}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Already have an account?{' '}
              <Link href="/login" className="text-primary font-medium underline-offset-4 hover:underline">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
