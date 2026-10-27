'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function getAuthenticatedUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  return { supabase, user }
}

export async function clockIn(formData: FormData) {
  const { supabase, user } = await getAuthenticatedUser()
  const organizationId = formData.get('organizationId') as string
  const projectId = (formData.get('projectId') as string) || null
  const notes = (formData.get('notes') as string) || null

  if (!organizationId) {
    return { error: 'Organization ID is required' }
  }

  const { error } = await supabase.from('work_sessions').insert({
    organization_id: organizationId,
    user_id: user.id,
    project_id: projectId,
    status: 'active',
    started_at: new Date().toISOString(),
    notes,
  })

  if (error) return { error: error.message }
  revalidatePath('/dashboard', 'page')
  return { success: true }
}

export async function pauseSession(sessionId: string) {
  const { supabase, user } = await getAuthenticatedUser()

  const { error } = await supabase
    .from('work_sessions')
    .update({ status: 'paused', updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/dashboard', 'page')
  return { success: true }
}

export async function resumeSession(sessionId: string) {
  const { supabase, user } = await getAuthenticatedUser()

  const { error } = await supabase
    .from('work_sessions')
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/dashboard', 'page')
  return { success: true }
}

export async function clockOut(sessionId: string) {
  const { supabase, user } = await getAuthenticatedUser()
  const now = new Date()
  const nowIso = now.toISOString()

  // 1. Fetch the session details to compute duration for time entry
  const { data: session, error: fetchError } = await supabase
    .from('work_sessions')
    .select('id, organization_id, project_id, started_at, notes')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !session) return { error: fetchError?.message || 'Session not found' }

  const startMs = new Date(session.started_at).getTime()
  const durationSeconds = Math.max(0, Math.floor((now.getTime() - startMs) / 1000))

  // 2. Concurrently update session and insert time entry
  const [sessionUpdateResult, timeEntryInsertResult] = await Promise.all([
    supabase
      .from('work_sessions')
      .update({
        status: 'completed',
        ended_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', sessionId)
      .eq('user_id', user.id),
    supabase.from('time_entries').insert({
      organization_id: session.organization_id,
      session_id: session.id,
      user_id: user.id,
      project_id: session.project_id,
      entry_type: 'automatic',
      approval_status: 'pending',
      started_at: session.started_at,
      ended_at: nowIso,
      duration_seconds: durationSeconds,
      description: session.notes,
    }),
  ])

  if (sessionUpdateResult.error) return { error: sessionUpdateResult.error.message }
  if (timeEntryInsertResult.error) return { error: timeEntryInsertResult.error.message }

  revalidatePath('/dashboard', 'page')
  revalidatePath('/dashboard/timesheets', 'page')
  return { success: true }
}

export async function logManualTimeEntry(formData: FormData) {
  const { supabase, user } = await getAuthenticatedUser()
  const organizationId = formData.get('organizationId') as string
  const projectId = (formData.get('projectId') as string) || null
  const description = (formData.get('description') as string) || null
  const durationHours = parseFloat((formData.get('durationHours') as string) || '0')

  if (!organizationId) return { error: 'Organization ID is required' }
  if (isNaN(durationHours) || durationHours <= 0) {
    return { error: 'Please enter a valid duration greater than 0' }
  }

  const durationSeconds = Math.round(durationHours * 3600)
  const now = new Date()
  const startedAt = new Date(now.getTime() - durationSeconds * 1000)

  const { error } = await supabase.from('time_entries').insert({
    organization_id: organizationId,
    user_id: user.id,
    project_id: projectId,
    entry_type: 'manual',
    approval_status: 'pending',
    started_at: startedAt.toISOString(),
    ended_at: now.toISOString(),
    duration_seconds: durationSeconds,
    description,
  })

  if (error) return { error: error.message }
  revalidatePath('/dashboard/timesheets', 'page')
  return { success: true }
}
