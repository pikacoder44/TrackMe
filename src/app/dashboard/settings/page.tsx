import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { TeamCodeForm } from './team-code-form'

interface OrgWithDetails {
  id: string
  name: string
  team_code: string | null
  require_approval: boolean
}

export default async function SettingsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organization_members')
    .select('role, organization:organizations(id, name, team_code, require_approval)')
    .eq('user_id', user.id)
    .maybeSingle()

  const role = membership?.role
  const isManager = role && ['owner', 'admin', 'manager', 'super_admin'].includes(role)
  const org = membership?.organization as unknown as OrgWithDetails | null

  if (!isManager || !org) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Organization Settings</h2>
          <p className="text-sm text-muted-foreground">Manage organization configuration and team codes.</p>
        </div>
        <Card className="border-destructive/20 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-destructive text-base">Access Restricted</CardTitle>
            <CardDescription>
              Only organization owners, administrators, and managers can manage team codes and organization settings.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Organization Settings & Onboarding</h2>
        <p className="text-sm text-muted-foreground">
          Configure security credentials, invite links, and employee approval policies for {org.name}.
        </p>
      </div>

      <TeamCodeForm
        organizationId={org.id}
        organizationName={org.name}
        initialTeamCode={org.team_code}
        initialRequireApproval={org.require_approval ?? true}
      />
    </div>
  )
}
