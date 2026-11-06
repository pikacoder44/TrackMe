import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logout } from '@/app/auth/actions'
import { Button } from '@/components/ui/button'
import { DashboardNav } from '@/components/dashboard/dashboard-nav'

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
  const adminSupabase = createAdminClient() || supabase

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch profile and organization memberships concurrently using admin client to guarantee hydration
  const [profileResult, membershipsResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .maybeSingle(),
    adminSupabase
      .from('organization_members')
      .select('*, organization:organizations(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1),
  ])

  const profile = profileResult.data
  let typedMemberships = (membershipsResult.data as unknown as MembershipWithOrg[]) || []

  // Fallback: If no organization membership found, check for a legacy profile slot
  if (typedMemberships.length === 0) {
    const adminClient = adminSupabase
    if (adminClient) {
      const userEmail = user.email || ''
      const userMetadata = user.user_metadata || {}
      const usernameVal = userMetadata.username || (userEmail ? userEmail.split('@')[0] : '')

      let legacyQuery = adminClient
        .from('profiles')
        .select('id')
        .neq('id', user.id)

      if (usernameVal) {
        legacyQuery = legacyQuery.or(`email.ilike.${userEmail},username.ilike.${usernameVal}`)
      } else if (userEmail) {
        legacyQuery = legacyQuery.ilike('email', userEmail)
      }

      const { data: legacyProfiles } = await legacyQuery
      if (legacyProfiles && legacyProfiles.length > 0) {
        const legacyProfileIds = legacyProfiles.map((p) => p.id)
        const { data: legacyMemberships } = await adminClient
          .from('organization_members')
          .select('organization_id, role, approval_status, organization:organizations(id, name)')
          .in('user_id', legacyProfileIds)
          .order('created_at', { ascending: false })
          .limit(1)

        const legacyMembership = legacyMemberships?.[0] || null

        if (legacyMembership?.organization_id) {
          await adminClient.from('organization_members').upsert(
            {
              organization_id: legacyMembership.organization_id,
              user_id: user.id,
              role: legacyMembership.role || 'manager',
              approval_status: legacyMembership.approval_status || 'approved',
            },
            { onConflict: 'organization_id,user_id' }
          )

          await adminClient
            .from('profiles')
            .update({ role: 'manager', approval_status: 'approved' })
            .eq('id', user.id)

          await adminClient
            .from('profiles')
            .delete()
            .in('id', legacyProfileIds)

          typedMemberships = [
            {
              role: (legacyMembership.role as MembershipWithOrg['role']) || 'manager',
              organization: legacyMembership.organization as unknown as MembershipWithOrg['organization'],
            },
          ]
        }
      }
    }
  }

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

          <DashboardNav userRole={currentMembership?.role} />
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
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wider uppercase px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
            Manager Hub
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-muted text-foreground border border-border/60 truncate max-w-xs">
            {user.email}
          </span>
        </header>
        <main className="flex-1 p-6 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
