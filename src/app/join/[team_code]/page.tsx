import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowRight, Building2, CheckCircle2, AlertCircle } from 'lucide-react'

interface JoinPageProps {
  params: Promise<{ team_code: string }>
}

export default async function JoinPage({ params }: JoinPageProps) {
  const { team_code } = await params
  const cleanCode = (team_code || '').trim().toUpperCase()

  const supabase = await createClient()

  // Verify team code via SECURITY DEFINER function (avoids direct table access for unauthenticated users)
  const { data: verifiedOrgs } = await supabase.rpc('verify_team_code', { p_team_code: cleanCode })
  const verifiedOrg = Array.isArray(verifiedOrgs) && verifiedOrgs.length > 0 ? verifiedOrgs[0] : null

  // Fetch org details for display (require_approval, slug) only after the code is verified
  const { data: org } = verifiedOrg
    ? await supabase
        .from('organizations')
        .select('id, name, slug, require_approval')
        .eq('id', verifiedOrg.organization_id)
        .maybeSingle()
    : { data: null }

  if (!org) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-muted/20">
        <Card className="w-full max-w-md shadow-xl border-border/60">
          <CardHeader className="space-y-2 text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
              <AlertCircle className="w-6 h-6" />
            </div>
            <CardTitle className="text-xl font-bold">Invalid Team Link</CardTitle>
            <CardDescription className="text-sm">
              The team join code <code className="font-mono font-semibold text-foreground">{cleanCode}</code> was not found or has been revoked by the manager.
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-col gap-2 pt-2">
            <Link href="/register" className="w-full">
              <Button className="w-full">Register with Another Code</Button>
            </Link>
            <Link href="/login" className="w-full">
              <Button variant="outline" className="w-full">Back to Login</Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    )
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-muted/20 relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(120,119,198,0.12),rgba(255,255,255,0))]" />

      <Card className="w-full max-w-lg shadow-xl border-border/60 backdrop-blur-sm bg-card/95">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
            <Building2 className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground bg-muted px-2.5 py-1 rounded-full border">
              Official Team Invitation
            </span>
            <CardTitle className="text-2xl font-bold tracking-tight pt-1">
              Join {org.name}
            </CardTitle>
            <CardDescription className="text-sm">
              You were invited to track work sessions and synchronize telemetry with {org.name}.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="p-4 rounded-xl bg-muted/40 border border-border/80 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground font-medium">Team Secret Code:</span>
              <span className="font-mono font-bold text-foreground text-sm tracking-wider px-2 py-0.5 rounded bg-background border">
                {cleanCode}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs pt-1 border-t border-border/40">
              <span className="text-muted-foreground font-medium">Approval Policy:</span>
              <span className={`inline-flex items-center gap-1 font-semibold ${org.require_approval ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {org.require_approval ? (
                  <>Manager Approval Required</>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Instant Onboarding
                  </>
                )}
              </span>
            </div>
          </div>

          <div className="text-xs text-muted-foreground leading-relaxed">
            Joining allows your activity telemetry, idle states, and hours to be verified by your team supervisors.
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3 pt-2">
          {user ? (
            <Link href={`/register?code=${cleanCode}`} className="w-full">
              <Button className="w-full h-11 text-sm font-medium">
                Continue to Register Account
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          ) : (
            <>
              <Link href={`/register?code=${cleanCode}`} className="w-full">
                <Button className="w-full h-11 text-sm font-medium">
                  Create Account with This Team
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
              <Link href={`/login`} className="w-full">
                <Button variant="outline" className="w-full h-11 text-sm">
                  Already have an account? Sign In
                </Button>
              </Link>
            </>
          )}

          <p className="text-[11px] text-muted-foreground text-center">
            <Link href="/" className="hover:text-foreground transition-colors">
              Back to TrackMe Home
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}
