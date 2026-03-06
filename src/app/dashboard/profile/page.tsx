'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const inp = (extra?: any) => ({ padding: '9px 12px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const, ...extra })
const lbl = { fontSize: 11, color: '#64748b', display: 'block', marginBottom: 3, fontWeight: 600 as const, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }

export default function ProfilePage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  // Profile fields
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState('')

  // Company fields
  const [companyName, setCompanyName] = useState('')
  const [companyCountry, setCompanyCountry] = useState('')
  const [companyCity, setCompanyCity] = useState('')
  const [companyVat, setCompanyVat] = useState('')
  const [companyPhone, setCompanyPhone] = useState('')
  const [companyAddress, setCompanyAddress] = useState('')

  // Password
  const [newPass, setNewPass] = useState('')
  const [confirmPass, setConfirmPass] = useState('')

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    setUserId(session.user.id)
    setEmail(session.user.email || '')
    setNewEmail(session.user.email || '')

    const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    if (p) {
      setFullName(p.full_name || '')
      setPhone(p.phone || '')
      setRole(p.role || 'user')
      setCompanyId(p.company_id)
      if (p.company_id) {
        const { data: c } = await supabase.from('companies').select('*').eq('id', p.company_id).single()
        if (c) {
          setCompanyName(c.name || '')
          setCompanyCountry(c.country || '')
          setCompanyCity(c.city || '')
          setCompanyVat(c.vat_number || c.vat || '')
          setCompanyPhone(c.phone || '')
          setCompanyAddress(c.address || '')
        }
      }
    }
    setLoading(false)
  }

  async function saveProfile() {
    if (!userId) return
    setSaving(true); setErr(''); setMsg('')
    try {
      // Update profile
      const { error: pe } = await supabase.from('profiles').update({
        full_name: fullName, phone: phone,
      }).eq('id', userId)
      if (pe) throw new Error(pe.message)

      // Update company
      if (companyId) {
        const { error: ce } = await supabase.from('companies').update({
          name: companyName, country: companyCountry, city: companyCity,
          vat_number: companyVat, phone: companyPhone, address: companyAddress,
        }).eq('id', companyId)
        if (ce) throw new Error(ce.message)
      }

      // Email change
      if (newEmail && newEmail !== email) {
        const { error: ee } = await supabase.auth.updateUser({ email: newEmail })
        if (ee) throw new Error('Email change: ' + ee.message)
        setMsg('✅ Profile saved. Check your new email address to confirm the change.')
      } else {
        setMsg('✅ Profile saved successfully.')
      }
    } catch (e: any) {
      setErr(e.message)
    }
    setSaving(false)
  }

  async function changePassword() {
    if (!newPass || newPass !== confirmPass) { setErr('Passwords do not match'); return }
    if (newPass.length < 8) { setErr('Password must be at least 8 characters'); return }
    setSaving(true); setErr('')
    const { error } = await supabase.auth.updateUser({ password: newPass })
    if (error) { setErr(error.message) } else { setMsg('✅ Password updated.'); setNewPass(''); setConfirmPass('') }
    setSaving(false)
  }

  if (loading) return <div style={{ padding: 40, color: '#94a3b8' }}>Loading profile...</div>

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 4px', letterSpacing: '-0.03em' }}>My Profile</h1>
        <div style={{ fontSize: 13, color: '#94a3b8' }}>Manage your account and company details</div>
      </div>

      {msg && <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, color: '#15803d', fontSize: 13, marginBottom: 16 }}>{msg}</div>}
      {err && <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: 13, marginBottom: 16 }}>{err}</div>}

      {/* Personal info */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 16 }}>Personal Information</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lbl}>Full Name</label>
            <input value={fullName} onChange={e => setFullName(e.target.value)} style={inp()} placeholder="Your name" />
          </div>
          <div>
            <label style={lbl}>Email Address</label>
            <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} style={inp()} />
            {newEmail !== email && <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 3 }}>⚠ You'll receive a confirmation email</div>}
          </div>
          <div>
            <label style={lbl}>Phone</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} style={inp()} placeholder="+44 7..." />
          </div>
          <div>
            <label style={lbl}>Role</label>
            <input value={role} disabled style={inp({ background: '#f1f5f9', color: '#94a3b8', cursor: 'not-allowed' })} />
          </div>
        </div>
      </div>

      {/* Company info */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 16 }}>Company Details</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lbl}>Company Name</label>
            <input value={companyName} onChange={e => setCompanyName(e.target.value)} style={inp()} />
          </div>
          <div>
            <label style={lbl}>Country</label>
            <input value={companyCountry} onChange={e => setCompanyCountry(e.target.value)} style={inp()} placeholder="DE, UK, TR..." />
          </div>
          <div>
            <label style={lbl}>City</label>
            <input value={companyCity} onChange={e => setCompanyCity(e.target.value)} style={inp()} placeholder="Berlin..." />
          </div>
          <div>
            <label style={lbl}>VAT Number</label>
            <input value={companyVat} onChange={e => setCompanyVat(e.target.value)} style={inp()} placeholder="DE123456789" />
          </div>
          <div>
            <label style={lbl}>Company Phone</label>
            <input value={companyPhone} onChange={e => setCompanyPhone(e.target.value)} style={inp()} placeholder="+49 30..." />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lbl}>Address</label>
            <input value={companyAddress} onChange={e => setCompanyAddress(e.target.value)} style={inp()} placeholder="Street, City, Postcode" />
          </div>
        </div>
      </div>

      <button onClick={saveProfile} disabled={saving}
        style={{ width: '100%', padding: 12, background: saving ? '#94a3b8' : '#0f172a', color: 'white', border: 'none', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 700, marginBottom: 16 }}>
        {saving ? 'Saving...' : 'Save Changes'}
      </button>

      {/* Password change */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 16 }}>Change Password</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={lbl}>New Password</label>
            <input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} style={inp()} placeholder="Min 8 characters" />
          </div>
          <div>
            <label style={lbl}>Confirm Password</label>
            <input type="password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)} style={inp()} />
          </div>
        </div>
        <button onClick={changePassword} disabled={saving || !newPass}
          style={{ marginTop: 12, padding: '9px 20px', background: !newPass ? '#94a3b8' : '#1e40af', color: 'white', border: 'none', borderRadius: 7, cursor: !newPass ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}>
          Update Password
        </button>
      </div>
    </div>
  )
}
