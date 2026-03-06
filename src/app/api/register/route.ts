import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(req: NextRequest) {
  try {
    const { email, password, companyName, fullName } = await req.json()
    if (!email || !password || !companyName) {
      return NextResponse.json({ error: 'Email, password and company name required' }, { status: 400 })
    }
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName || '' }
    })
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }
    const { data: rpcData, error: rpcError } = await adminClient.rpc('register_company', {
      p_user_id: authData.user.id,
      p_company_name: companyName.trim().toUpperCase(),
      p_full_name: fullName?.trim().toUpperCase() || null,
    })
    if (rpcError) {
      await adminClient.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ error: rpcError.message }, { status: 500 })
    }
    if (rpcData?.[0]?.error) {
      await adminClient.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ error: rpcData[0].error }, { status: 400 })
    }
    return NextResponse.json({ success: true, role: rpcData?.[0]?.role || 'user' })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Unknown error' }, { status: 500 })
  }
}
