import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, CheckCircle2, Globe, Compass, ShieldAlert, Sparkles } from 'lucide-react'

export default async function InstallPage(props: {
  searchParams?: Promise<{ registered?: string }>
}) {
  const searchParams = await props.searchParams
  const isRegistered = searchParams?.registered === 'true'

  return (
    <div className="flex flex-col min-h-screen bg-muted/20">
      {/* Top bar */}
      <header className="border-b bg-background/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
            <div className="h-7 w-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
              T
            </div>
            <span className="font-semibold text-base tracking-tight">TrackMe</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">
                Login
              </Button>
            </Link>
            <Link href="/register">
              <Button size="sm">Register</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto px-6 py-12 space-y-8 w-full">
        {isRegistered && (
          <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-950 dark:text-emerald-200 flex items-start gap-3 shadow-sm">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="font-semibold text-sm">Account Registered — Pending Manager Approval</p>
              <p className="text-xs text-emerald-800/90 dark:text-emerald-300">
                Your account was created with status <strong>Pending</strong>. Your manager will approve your access in the supervisory dashboard. Follow the instructions below to install the extension now so you are ready to clock in immediately upon approval.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-3 text-center sm:text-left">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
            <Sparkles className="h-3.5 w-3.5" /> Manifest V3 Ready
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            Install the TrackMe Browser Extension
          </h1>
          <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
            The TrackMe telemetry collector operates directly inside your web browser. Follow the simple steps below to load the extension in your preferred browser.
          </p>
        </div>

        {/* Browser Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Google Chrome */}
          <Card className="border-border/60 shadow-sm flex flex-col justify-between hover:border-primary/50 transition-colors">
            <CardHeader className="space-y-2">
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                <Globe className="h-6 w-6" />
              </div>
              <CardTitle className="text-lg">Google Chrome</CardTitle>
              <CardDescription>Targeted for Chrome 120+ (Manifest V3)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-xs text-muted-foreground flex-1">
              <ol className="list-decimal pl-4 space-y-2.5">
                <li>
                  Open <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-foreground">chrome://extensions</code> in your address bar.
                </li>
                <li>
                  Enable <strong>Developer mode</strong> in the top-right corner.
                </li>
                <li>
                  Click the <strong>Load unpacked</strong> button.
                </li>
                <li>
                  Select the local <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-foreground">/extension</code> directory.
                </li>
                <li>
                  Pin TrackMe to your toolbar and click the icon to begin!
                </li>
              </ol>
            </CardContent>
          </Card>

          {/* Mozilla Firefox */}
          <Card className="border-border/60 shadow-sm flex flex-col justify-between hover:border-primary/50 transition-colors">
            <CardHeader className="space-y-2">
              <div className="h-10 w-10 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center font-bold">
                <Compass className="h-6 w-6" />
              </div>
              <CardTitle className="text-lg">Mozilla Firefox</CardTitle>
              <CardDescription>Targeted for Firefox 120+ with native storage</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-xs text-muted-foreground flex-1">
              <ol className="list-decimal pl-4 space-y-2.5">
                <li>
                  Open <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-foreground">about:debugging#/runtime/this-firefox</code>.
                </li>
                <li>
                  Click the <strong>Load Temporary Add-on...</strong> button.
                </li>
                <li>
                  Navigate to <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-foreground">/extension</code> and select <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-foreground">manifest.json</code>.
                </li>
                <li>
                  The TrackMe telemetry worker will activate immediately in your toolbar.
                </li>
              </ol>
            </CardContent>
          </Card>

          {/* Brave Browser */}
          <Card className="border-border/60 shadow-sm flex flex-col justify-between hover:border-primary/50 transition-colors">
            <CardHeader className="space-y-2">
              <div className="h-10 w-10 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <CardTitle className="text-lg">Brave Browser</CardTitle>
              <CardDescription>Chromium engine with strict shields compatibility</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-xs text-muted-foreground flex-1">
              <ol className="list-decimal pl-4 space-y-2.5">
                <li>
                  Open <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-foreground">brave://extensions</code> in your address bar.
                </li>
                <li>
                  Toggle <strong>Developer mode</strong> in the upper right.
                </li>
                <li>
                  Click <strong>Load unpacked</strong>.
                </li>
                <li>
                  Select the <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-foreground">/extension</code> folder from your project.
                </li>
                <li>
                  Brave Shields won&apos;t block local telemetry ticks to your hub.
                </li>
              </ol>
            </CardContent>
          </Card>
        </div>

        {/* Quick Links */}
        <div className="p-6 rounded-xl border bg-card flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="space-y-1 text-center sm:text-left">
            <p className="font-semibold text-sm">Need to register your employee account?</p>
            <p className="text-xs text-muted-foreground">Make sure you have your organization&apos;s Secret Team Code handy.</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/register">
              <Button size="sm">Register Account</Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="sm">Sign In</Button>
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
