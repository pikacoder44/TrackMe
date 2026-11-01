'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { resolveUserSystemRole } from '@/lib/auth-rbac'

import { createAdminClient } from '@/lib/supabase/admin'

async function assertSuperAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error('Unauthorized')

  const { role } = await resolveUserSystemRole(supabase, user)
  if (role !== 'super_admin') {
    throw new Error('Forbidden: Super Admin access required.')
  }

  return { supabase, user }
}

export async function provisionManagerSlotAction(formData: FormData) {
  const fullName = ((formData.get('fullName') as string) || '').trim()
  const identifier = (
    (formData.get('usernameOrEmail') as string) ||
    (formData.get('identifier') as string) ||
    (formData.get('username') as string) ||
    (formData.get('email') as string) ||
    ''
  ).trim()

  if (!fullName || !identifier) {
    return { error: 'Full Name and Username / Email are required.' }
  }

  try {
    const { supabase } = await assertSuperAdmin()
    const adminClient = createAdminClient()
    const db = adminClient || supabase

    let email: string
    let username: string

    if (identifier.includes('@')) {
      email = identifier.toLowerCase()
      username = identifier.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '')
    } else {
      username = identifier.toLowerCase().replace(/[^a-z0-9._-]/g, '')
      email = `${username}@company.internal`
    }

    if (!username) {
      return { error: 'Invalid username format.' }
    }

    // Try RPC provision_manager_slot first (defined in migration 00008)
    try {
      const { data: rpcData, error: rpcError } = await db.rpc('provision_manager_slot', {
        p_full_name: fullName,
        p_username: username,
        p_email: email,
      })

      if (!rpcError && rpcData) {
        const slot = rpcData as { id: string; fullName: string; email: string; username: string }
        revalidatePath('/admin/dashboard', 'page')
        revalidatePath('/admin/dashboard', 'layout')
        return {
          success: true,
          manager: {
            id: slot.id,
            fullName: slot.fullName || fullName,
            email: slot.email || email,
            username: slot.username || username,
          },
        }
      }
    } catch {
      // Fall through to direct table operations
    }

    // Direct table operation using admin client or authenticated super admin client
    const { data: existing } = await db
      .from('profiles')
      .select('id, email, username, role, full_name')
      .or(`username.ilike.${username},email.ilike.${email}`)
      .maybeSingle()

    if (existing) {
      const { error: updateError } = await db
        .from('profiles')
        .update({
          full_name: fullName,
          role: 'manager',
          approval_status: 'approved',
        })
        .eq('id', existing.id)

      if (updateError) {
        return { error: updateError.message }
      }

      revalidatePath('/admin/dashboard', 'page')
      revalidatePath('/admin/dashboard', 'layout')
      return {
        success: true,
        manager: {
          id: existing.id,
          fullName,
          email: existing.email,
          username: existing.username || username,
        },
      }
    }

    // Insert pre-approved profile slot
    const { data: newProfile, error: insertError } = await db
      .from('profiles')
      .insert({
        full_name: fullName,
        username,
        email,
        role: 'manager',
        approval_status: 'approved',
        is_pending_signup: true,
      })
      .select('id, full_name, username, email, is_pending_signup')
      .single()

    if (insertError) {
      return { error: insertError.message }
    }

    revalidatePath('/admin/dashboard', 'page')
    revalidatePath('/admin/dashboard', 'layout')
    return {
      success: true,
      manager: {
        id: newProfile.id,
        fullName: newProfile.full_name || fullName,
        email: newProfile.email,
        username: newProfile.username || username,
      },
    }
  } catch (err: unknown) {
    return {
      error: err instanceof Error ? err.message : 'Failed to provision manager slot.',
    }
  }
}

export const createManagerAction = provisionManagerSlotAction

export async function getCandidateManagers() {
  const { supabase } = await assertSuperAdmin()
  const adminClient = createAdminClient()
  const db = adminClient || supabase

  const { data, error } = await db
    .from('profiles')
    .select('id, full_name, username, email, role, approval_status, is_pending_signup')
    .or('role.eq.manager,approval_status.eq.approved')
    .order('username')

  if (error || !data) {
    return []
  }

  return data
    .filter((p) => p.role === 'manager' || p.approval_status === 'approved')
    .map((p) => ({
      id: p.id,
      username: p.username || (p.email ? p.email.split('@')[0] : 'manager'),
      fullName: p.full_name || p.username || (p.email ? p.email.split('@')[0] : 'Manager'),
      email: p.email || '',
      isPendingSignup: Boolean(p.is_pending_signup),
    }))
}

export async function createTeamAction(formData: FormData) {
  const teamName = ((formData.get('teamName') as string) || '').trim()
  const teamColor = ((formData.get('teamColor') as string) || '#3B82F6').trim()
  const rawManager = (
    (formData.get('managerId') as string) ||
    (formData.get('managerUsername') as string) ||
    ''
  ).trim()

  if (!teamName) {
    return { error: 'Team name is required.' }
  }

  try {
    const { supabase } = await assertSuperAdmin()
    const adminClient = createAdminClient()
    const db = adminClient || supabase

    // Generate random 4-digit team code
    const teamCode = `TRACK-${Math.floor(1000 + Math.random() * 9000)}`
    const slug = teamName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

    // 1. Create Organization with color accent
    const { data: newOrg, error: orgError } = await db
      .from('organizations')
      .insert({
        name: teamName,
        slug,
        team_code: teamCode,
        color: teamColor,
        require_approval: false,
      })
      .select('id, name, team_code, color')
      .single()

    if (orgError) {
      return { error: orgError.message }
    }

    // 2. Resolve manager in public.profiles (where id = managerId or username/email matches)
    // Allows assignment if profile exists with role = 'manager' or approval_status = 'approved',
    // regardless of whether an auth.users record exists yet.
    if (rawManager && rawManager !== 'none' && newOrg) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawManager)

      let query = db
        .from('profiles')
        .select('id, username, email, role, approval_status')
      if (isUuid) {
        query = query.or(`id.eq.${rawManager},username.ilike.${rawManager},email.ilike.${rawManager}`)
      } else {
        query = query.or(`username.ilike.${rawManager},email.ilike.${rawManager}`)
      }

      const { data: managerProfile } = await query.maybeSingle()

      if (managerProfile) {
        // Upsert into organization_members using managerId from public.profiles
        await db.from('organization_members').upsert(
          {
            organization_id: newOrg.id,
            user_id: managerProfile.id,
            role: 'manager',
            approval_status: 'approved',
          },
          { onConflict: 'organization_id,user_id' }
        )

        // Ensure profile role is manager and approved
        await db
          .from('profiles')
          .update({ role: 'manager', approval_status: 'approved' })
          .eq('id', managerProfile.id)
      }
    }

    revalidatePath('/admin/dashboard', 'page')
    revalidatePath('/admin/dashboard', 'layout')
    return { success: true, team: newOrg }
  } catch (err: unknown) {
    return {
      error: err instanceof Error ? err.message : 'Failed to create team.',
    }
  }
}

export async function notifyManagerAction(managerId: string, organizationId: string) {
  if (!managerId) return { error: 'Manager ID is required.' }

  try {
    const { supabase } = await assertSuperAdmin()
    const adminClient = createAdminClient()
    const db = adminClient || supabase

    // Check if manager was notified in the last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { data: recentNotice } = await db
      .from('manager_notifications')
      .select('id, notified_at')
      .eq('manager_id', managerId)
      .gte('notified_at', twentyFourHoursAgo)
      .order('notified_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (recentNotice) {
      const noticeDate = new Date(recentNotice.notified_at)
      const hoursRemaining = Math.max(
        1,
        24 - Math.floor((Date.now() - noticeDate.getTime()) / (1000 * 60 * 60))
      )
      return {
        error: `Manager was already notified today. Cool-down active (${hoursRemaining}h remaining).`,
      }
    }

    // Record notification log
    const { error: insertError } = await db
      .from('manager_notifications')
      .insert({
        manager_id: managerId,
        organization_id: organizationId,
      })

    if (insertError) {
      return { error: insertError.message }
    }

    revalidatePath('/admin/dashboard', 'page')
    revalidatePath('/admin/dashboard', 'layout')
    return { success: true, notifiedAt: new Date().toISOString() }
  } catch (err: unknown) {
    return {
      error: err instanceof Error ? err.message : 'Failed to notify manager.',
    }
  }
}

export async function assignManagerToTeamAction(teamId: string, managerUsername: string) {
  const cleanIdentifier = (managerUsername || '').trim().toLowerCase()
  if (!teamId || !cleanIdentifier) {
    return { error: 'Team and Manager selection are required.' }
  }

  try {
    const { supabase } = await assertSuperAdmin()
    const adminClient = createAdminClient()
    const db = adminClient || supabase

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanIdentifier)

    // 1. Manager Profile Verification:
    // Check public.profiles (where id = managerId or username/email matches)
    // Allow assignment if profile exists with role = 'manager' or approval_status = 'approved',
    // regardless of whether an auth.users record exists yet.
    let query = db
      .from('profiles')
      .select('id, username, email, role, approval_status')
    if (isUuid) {
      query = query.or(`id.eq.${cleanIdentifier},username.ilike.${cleanIdentifier},email.ilike.${cleanIdentifier}`)
    } else {
      query = query.or(`username.ilike.${cleanIdentifier},email.ilike.${cleanIdentifier}`)
    }

    const { data: managerProfile } = await query.maybeSingle()

    if (!managerProfile) {
      return { error: `Profile "${managerUsername}" not found. Please verify the selection.` }
    }

    // 2. Organization Member Upsert:
    // Insert/upsert into public.organization_members using managerId from public.profiles
    // setting role: 'manager' and approval_status: 'approved'
    const { error: upsertError } = await db.from('organization_members').upsert(
      {
        organization_id: teamId,
        user_id: managerProfile.id,
        role: 'manager',
        approval_status: 'approved',
      },
      { onConflict: 'organization_id,user_id' }
    )

    if (upsertError) {
      return { error: upsertError.message }
    }

    await db
      .from('profiles')
      .update({ role: 'manager', approval_status: 'approved' })
      .eq('id', managerProfile.id)

    // 3. Revalidation: Call revalidatePath for both 'page' and 'layout'
    revalidatePath('/admin/dashboard', 'page')
    revalidatePath('/admin/dashboard', 'layout')
    return { success: true, message: 'Manager assigned successfully.' }
  } catch (err: unknown) {
    return {
      error: err instanceof Error ? err.message : 'Failed to assign manager.',
    }
  }
}

