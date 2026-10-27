'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function checkManagerPermission(organizationId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error('Unauthorized')

  const { data: member } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', user.id)
    .single()

  if (!member || !['owner', 'admin', 'manager'].includes(member.role)) {
    throw new Error('Forbidden: only owners, admins, and managers can manage approvals.')
  }

  return { supabase, user }
}

export async function approveTimeEntry(entryId: string, organizationId: string) {
  const { supabase } = await checkManagerPermission(organizationId)

  const { error } = await supabase
    .from('time_entries')
    .update({ approval_status: 'approved', updated_at: new Date().toISOString() })
    .eq('id', entryId)
    .eq('organization_id', organizationId)

  if (error) return { error: error.message }
  revalidatePath('/dashboard/approvals', 'page')
  revalidatePath('/dashboard/timesheets', 'page')
  return { success: true }
}

export async function rejectTimeEntry(entryId: string, organizationId: string) {
  const { supabase } = await checkManagerPermission(organizationId)

  const { error } = await supabase
    .from('time_entries')
    .update({ approval_status: 'rejected', updated_at: new Date().toISOString() })
    .eq('id', entryId)
    .eq('organization_id', organizationId)

  if (error) return { error: error.message }
  revalidatePath('/dashboard/approvals', 'page')
  revalidatePath('/dashboard/timesheets', 'page')
  return { success: true }
}
