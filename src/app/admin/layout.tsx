import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { resolveUserSystemRole } from '@/lib/auth-rbac'
import { logout } from '@/app/auth/actions'
import { Button } from '@/components/ui/button'
import { ShieldCheck, LogOut } from 'lucide-react'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { role } = await resolveUserSystemRole(supabase, user)
  if (role !== 'super_admin') {
    redirect(role === 'manager' ? '/dashboard' : '/install')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', user.id)
    .maybeSingle()

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      {/* Top Super Admin Navigation Bar */}
      <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard" className="flex items-center gap-2.5 group">
              <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shadow group-hover:scale-105 transition-transform">
                T
              </div>
              <span className="font-bold text-lg tracking-tight">TrackMe</span>
            </Link>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold tracking-wider uppercase px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
              <ShieldCheck className="w-3.5 h-3.5" /> Super Admin Portal
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end text-xs">
              <span className="font-semibold text-foreground">
                {profile?.full_name || 'System Administrator'}
              </span>
              <span className="text-muted-foreground">{user.email}</span>
            </div>

            <Link href="/dashboard">
              <Button variant="ghost" size="sm" className="text-xs">
                Manager Hub
              </Button>
            </Link>

            <form action={logout}>
              <Button variant="outline" size="sm" type="submit" className="text-xs flex items-center gap-1.5">
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </Button>
            </form>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  )
}
