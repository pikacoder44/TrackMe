'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function login(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      console.error("SUPABASE AUTH ERROR:", {
        message: error.message,
        status: error.status,
        name: error.name,
        details: error,
      })
      return { error: error.message }
    }
  } catch (err: unknown) {
    console.error("SUPABASE AUTH ERROR:", err)
    return {
      error: err instanceof Error ? err.message : 'Unexpected authentication error',
    }
  }

  redirect('/dashboard')
}

export async function signup(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const fullName = formData.get('fullName') as string

  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    })

    if (error) {
      console.error("SUPABASE AUTH ERROR:", {
        message: error.message,
        status: error.status,
        name: error.name,
        details: error,
      })
      return { error: error.message }
    }
  } catch (err: unknown) {
    console.error("SUPABASE AUTH ERROR:", err)
    return {
      error: err instanceof Error ? err.message : 'Unexpected sign-up error',
    }
  }

  redirect('/dashboard')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
