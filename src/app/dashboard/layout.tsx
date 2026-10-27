import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { logout } from '@/app/auth/actions'
import { Button } from '@/components/ui/button'

interface MembershipWithOrg {
  role: 'owner' | 'admin' | 'manager' | 'employee'
  organization: {
    id: string
    name: string
  } | null
}

export default async function DashboardLayout({
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', user.id)
    .single()

  const { data: memberships } = await supabase
    .from('organization_members')
    .select('role, organization:organizations(id, name)')
    .eq('user_id', user.id)

  const typedMemberships = (memberships as unknown as MembershipWithOrg[]) || []
  const currentMembership = typedMemberships[0] || null
  const currentOrg = currentMembership?.organization

  return (
    <div className="flex min-h-screen bg-muted/20">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-background flex flex-col justify-between p-4">
        <div className="space-y-6">
          <div className="flex items-center gap-2 px-2 py-1">
            <div className="h-7 w-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
              T
            </div>
            <span className="font-semibold text-lg tracking-tight">TrackMe</span>
          </div>

          <div className="p-3 bg-muted/50 rounded-lg space-y-1">
            <p className="text-xs text-muted-foreground uppercase font-medium tracking-wider">
              Organization
            </p>
            <p className="font-medium text-sm truncate">
              {currentOrg?.name ?? 'No Organization'}
            </p>
            {currentMembership?.role && (
              <span className="inline-block text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-primary/10 text-primary">
                {currentMembership.role}
              </span>
            )}
          </div>

          <nav className="space-y-1 text-sm font-medium">
            <Link
              href="/dashboard"
              className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted transition-colors text-foreground"
            >
              Dashboard
            </Link>
            <Link
              href="/dashboard/timesheets"
              className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            >
              Timesheets
            </Link>
            <Link
              href="/dashboard/analytics"
              className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            >
              Analytics
            </Link>
            {['owner', 'admin', 'manager'].includes(currentMembership?.role || '') && (
              <Link
                href="/dashboard/approvals"
                className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                Approvals
              </Link>
            )}
          </nav>
        </div>

        <div className="border-t pt-4 space-y-3">
          <div className="px-2">
            <p className="text-sm font-medium truncate">
              {profile?.full_name || user.email?.split('@')[0]}
            </p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
          <form action={logout}>
            <Button variant="outline" size="sm" type="submit" className="w-full">
              Sign out
            </Button>
          </form>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b bg-background px-6 flex items-center justify-between">
          <h1 className="font-semibold text-sm text-muted-foreground">Workspace</h1>
          <span className="text-xs text-muted-foreground">
            {profile?.full_name ?? user.email}
          </span>
        </header>
        <main className="flex-1 p-6 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
