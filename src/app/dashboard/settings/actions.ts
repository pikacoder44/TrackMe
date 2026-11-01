'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function getManagerContext(organizationId: string) {
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
    throw new Error('Unauthorized: only managers, admins, or owners can update team settings.')
  }

  return { supabase, user }
}

export async function updateTeamCode(formData: FormData) {
  const organizationId = formData.get('organizationId') as string
  const newCode = ((formData.get('teamCode') as string) || '').trim().toUpperCase()

  if (!organizationId || !newCode) {
    return { error: 'Organization ID and Team Code are required.' }
  }

  if (newCode.length < 4 || newCode.length > 20) {
    return { error: 'Team Code must be between 4 and 20 characters.' }
  }

  try {
    const { supabase } = await getManagerContext(organizationId)

    const { error } = await supabase
      .from('organizations')
      .update({ team_code: newCode, updated_at: new Date().toISOString() })
      .eq('id', organizationId)

    if (error) {
      if (error.code === '23505') {
        return { error: 'This Secret Team Code is already taken by another organization.' }
      }
      return { error: error.message }
    }

    revalidatePath('/dashboard/settings', 'page')
    return { success: true, teamCode: newCode }
  } catch (err: unknown) {
    return {
      error: err instanceof Error ? err.message : 'Failed to update team code.',
    }
  }
}

export async function regenerateTeamCode(organizationId: string) {
  if (!organizationId) {
    return { error: 'Organization ID is required.' }
  }

  try {
    const { supabase } = await getManagerContext(organizationId)

    // Generate random 4-digit TRACK-XXXX code
    const randomDigits = Math.floor(1000 + Math.random() * 9000).toString()
    const newCode = `TRACK-${randomDigits}`

    const { error } = await supabase
      .from('organizations')
      .update({ team_code: newCode, updated_at: new Date().toISOString() })
      .eq('id', organizationId)

    if (error) {
      return { error: error.message }
    }

    revalidatePath('/dashboard/settings', 'page')
    return { success: true, teamCode: newCode }
  } catch (err: unknown) {
    return {
      error: err instanceof Error ? err.message : 'Failed to regenerate team code.',
    }
  }
}
