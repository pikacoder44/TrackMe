import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Zap,
  Activity,
  ArrowRight,
  Download,
  Users,
  CheckCircle2,
  Lock,
} from 'lucide-react'

export default function HomePage() {
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      {/* Navigation Header */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold text-base shadow-sm">
              T
            </div>
            <span className="font-bold text-xl tracking-tight">TrackMe</span>
            <span className="text-[10px] uppercase font-semibold tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              Telemetry Hub
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <Link href="#how-it-works" className="hover:text-foreground transition-colors">
              How It Works
            </Link>
            <Link href="#features" className="hover:text-foreground transition-colors">
              Features
            </Link>
            <Link href="/install" className="hover:text-foreground transition-colors">
              Supported Browsers
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button size="sm" className="text-sm shadow-sm">
                Sign In / Register
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-20 pb-16 md:pt-28 md:pb-24 border-b">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),rgba(255,255,255,0))]" />
        <div className="max-w-5xl mx-auto px-6 text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border bg-muted/40 text-xs font-medium text-muted-foreground">
            <Zap className="h-3.5 w-3.5 text-primary" />
            <span>Next-Generation Manifest V3 Telemetry Architecture</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.15]">
            Real-Time Productivity Telemetry{' '}
            <span className="bg-gradient-to-r from-primary via-indigo-500 to-sky-500 bg-clip-text text-transparent">
              Without the Micromanagement
            </span>
          </h1>

          <p className="max-w-2xl mx-auto text-lg sm:text-xl text-muted-foreground leading-relaxed">
            TrackMe combines a lightweight browser extension with a supervisory management dashboard.
            Track active window telemetry, automate time accounting, and empower remote engineering teams.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link href="/install">
              <Button size="lg" className="w-full sm:w-auto gap-2 px-8 shadow-md">
                <Download className="h-4 w-4" />
                <span>Install Extension</span>
              </Button>
            </Link>
            <Link href="/register">
              <Button size="lg" variant="outline" className="w-full sm:w-auto gap-2 px-8">
                <span>Join with Team Code</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          {/* Interactive Mockup / Live Preview Card */}
          <div className="pt-10 max-w-3xl mx-auto">
            <div className="rounded-xl border bg-card p-6 shadow-2xl space-y-4 text-left">
              <div className="flex items-center justify-between border-b pb-4">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-semibold text-sm">Active Session in Progress</span>
                </div>
                <div className="font-mono text-sm px-2.5 py-1 rounded bg-muted text-foreground">
                  03:42:18
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div className="p-3.5 rounded-lg bg-muted/40 border space-y-1">
                  <span className="text-xs text-muted-foreground uppercase font-medium">Active Window</span>
                  <p className="font-medium text-sm truncate">GitHub — pull/42 #review</p>
                </div>
                <div className="p-3.5 rounded-lg bg-muted/40 border space-y-1">
                  <span className="text-xs text-muted-foreground uppercase font-medium">Organization</span>
                  <p className="font-medium text-sm truncate">Acme Engineering</p>
                </div>
                <div className="p-3.5 rounded-lg bg-muted/40 border space-y-1">
                  <span className="text-xs text-muted-foreground uppercase font-medium">Telemetry Status</span>
                  <p className="font-medium text-sm text-emerald-600 dark:text-emerald-400">Buffered & Synced</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3-Step Getting Started Section */}
      <section id="how-it-works" className="py-20 md:py-28 bg-muted/20 border-b">
        <div className="max-w-6xl mx-auto px-6 space-y-14">
          <div className="text-center space-y-4">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Get Started in 3 Simple Steps
            </h2>
            <p className="text-muted-foreground text-base max-w-xl mx-auto">
              Onboard employees quickly with zero complex IT setups or intrusive desktop clients.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <Card className="relative border-border/60 shadow-sm transition-all hover:shadow-md">
              <CardContent className="pt-6 space-y-4">
                <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
                  1
                </div>
                <h3 className="text-xl font-bold">Install Extension</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Add the TrackMe WebExtension to Firefox, Chrome, or Brave. It operates directly in your browser with minimal memory overhead.
                </p>
                <div className="pt-2">
                  <Link href="/install" className="text-sm font-semibold text-primary hover:underline inline-flex items-center gap-1">
                    Choose your browser <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </CardContent>
            </Card>

            {/* Step 2 */}
            <Card className="relative border-border/60 shadow-sm transition-all hover:shadow-md">
              <CardContent className="pt-6 space-y-4">
                <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
                  2
                </div>
                <h3 className="text-xl font-bold">Register with Team Code</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Sign up with your work email and the 6-character Secret Team Code provided by your team lead (e.g. TRACK-8821).
                </p>
                <div className="pt-2">
                  <Link href="/register" className="text-sm font-semibold text-primary hover:underline inline-flex items-center gap-1">
                    Register employee <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </CardContent>
            </Card>

            {/* Step 3 */}
            <Card className="relative border-border/60 shadow-sm transition-all hover:shadow-md">
              <CardContent className="pt-6 space-y-4">
                <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
                  3
                </div>
                <h3 className="text-xl font-bold">Manager Approval</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Your manager approves your account from the dashboard. Once activated, clock-in controls unlock immediately.
                </p>
                <div className="pt-2">
                  <span className="text-xs px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium inline-flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Secure Verification
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Feature Highlights Section */}
      <section id="features" className="py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-6 space-y-14">
          <div className="text-center space-y-4">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Built for Modern Supervisory Workflows
            </h2>
            <p className="text-muted-foreground text-base max-w-xl mx-auto">
              Enterprise-grade telemetry with strict data isolation and effortless manager visibility.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-xl border bg-card space-y-3">
              <div className="h-10 w-10 rounded-lg bg-sky-500/10 text-sky-500 flex items-center justify-center">
                <Activity className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-lg">Passive Telemetry</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Captures active window context and domain changes in real-time without taking intrusive screenshots or keystrokes.
              </p>
            </div>

            <div className="p-6 rounded-xl border bg-card space-y-3">
              <div className="h-10 w-10 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                <Lock className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-lg">Multi-Tenant Isolation</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                PostgreSQL Row Level Security guarantees complete isolation of employee telemetry and timesheets per organization.
              </p>
            </div>

            <div className="p-6 rounded-xl border bg-card space-y-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                <Users className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-lg">Team Approval Gates</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Managers retain full governance over organization access with secret team codes and instant 1-click approvals.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-10 bg-muted/30">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded bg-primary text-primary-foreground flex items-center justify-center font-bold text-[10px]">
              T
            </div>
            <span className="font-semibold text-foreground">TrackMe</span>
            <span>— Precision Telemetry Hub</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/install" className="hover:text-foreground">
              Install Extension
            </Link>
            <Link href="/register" className="hover:text-foreground">
              Register
            </Link>
            <Link href="/login" className="hover:text-foreground">
              Sign In
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
