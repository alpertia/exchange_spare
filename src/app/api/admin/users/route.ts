import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if ((profile as any)?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') ?? '1')
  const perPage = parseInt(searchParams.get('perPage') ?? '50')

  const { data, error } = await supabaseAdmin.auth.admin.listUsers({
    page,
    perPage
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const users = data.users.map(u => ({
    id: u.id,
    email: u.email,
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at,
    confirmed_at: u.email_confirmed_at,
    role: u.user_metadata?.role ?? 'user',
    company_name: u.user_metadata?.company_name ?? null
  }))

  return NextResponse.json({
    users,
    total: data.total ?? users.length,
    page,
    perPage
  })
}
