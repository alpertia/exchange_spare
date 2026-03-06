'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function RegisterPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleRegister() {
    setLoading(true)
    setError('')

    const cleanCompany = companyName.trim().toUpperCase()
    const cleanName = fullName.trim().toUpperCase()

    if (!cleanCompany) { setError('Company name is required'); setLoading(false); return }
    if (!email.trim()) { setError('Email is required'); setLoading(false); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); setLoading(false); return }

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          companyName: cleanCompany,
          fullName: cleanName || null,
        }),
      })

      const data = await res.json()

      if (!res.ok || data.error) {
        setError(data.error || 'Registration failed')
        setLoading(false)
        return
      }

      // Sign in after successful registration
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })

      if (signInErr) {
        setError('Account created! Please sign in.')
        router.push('/login')
        return
      }

      router.push('/dashboard')
    } catch (e: any) {
      setError(e.message || 'Registration failed')
    }

    setLoading(false)
  }

  const inp = {
    width: '100%', padding: '10px 12px', borderRadius: '8px',
    border: '1px solid #334155', background: '#0f172a', color: 'white',
    fontSize: '14px', boxSizing: 'border-box' as const, outline: 'none',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0b1120', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: '440px', padding: '40px', background: '#1e293b', borderRadius: '16px', border: '1px solid #334155' }}>
        <h1 style={{ color: 'white', fontSize: '22px', fontWeight: 'bold', marginBottom: '6px' }}>Create Account</h1>
        <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '28px' }}>SpareShare B2B Exchange</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ color: '#94a3b8', fontSize: '13px', display: 'block', marginBottom: '6px' }}>Company Name *</label>
            <input placeholder="YOUR COMPANY LTD" value={companyName}
              onChange={e => setCompanyName(e.target.value.toUpperCase())}
              style={{ ...inp, letterSpacing: '0.04em' }} />
            <div style={{ fontSize: '11px', color: '#475569', marginTop: '4px' }}>Stored uppercase · must be unique</div>
          </div>

          <div>
            <label style={{ color: '#94a3b8', fontSize: '13px', display: 'block', marginBottom: '6px' }}>Full Name</label>
            <input placeholder="JOHN DOE" value={fullName}
              onChange={e => setFullName(e.target.value.toUpperCase())}
              style={{ ...inp, letterSpacing: '0.02em' }} />
          </div>

          <div>
            <label style={{ color: '#94a3b8', fontSize: '13px', display: 'block', marginBottom: '6px' }}>Email *</label>
            <input type="email" placeholder="email@company.com" value={email}
              onChange={e => setEmail(e.target.value)} style={inp} />
          </div>

          <div>
            <label style={{ color: '#94a3b8', fontSize: '13px', display: 'block', marginBottom: '6px' }}>Password *</label>
            <input type="password" placeholder="At least 6 characters" value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRegister()} style={inp} />
          </div>

          {error && (
            <div style={{ padding: '10px 14px', background: '#450a0a', border: '1px solid #991b1b', borderRadius: '8px', color: '#fca5a5', fontSize: '13px' }}>
              {error}
            </div>
          )}

          <button onClick={handleRegister} disabled={loading} style={{
            padding: '12px', background: loading ? '#334155' : '#2563eb',
            color: loading ? '#64748b' : 'white', border: 'none', borderRadius: '8px',
            cursor: loading ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: '600', marginTop: '4px',
          }}>
            {loading ? 'Creating account...' : 'Create Account'}
          </button>

          <a href="/login" style={{ color: '#64748b', fontSize: '13px', textAlign: 'center', textDecoration: 'none' }}>
            Already have an account? <span style={{ color: '#60a5fa' }}>Sign in</span>
          </a>
        </div>
      </div>
    </div>
  )
}
