'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function RegisterPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleRegister() {
    setLoading(true)
    setError('')

    if (!companyName.trim()) { setError('Firma adı zorunlu'); setLoading(false); return }
    if (!email.trim()) { setError('Email zorunlu'); setLoading(false); return }
    if (password.length < 6) { setError('Şifre en az 6 karakter olmalı'); setLoading(false); return }

    // Firma adı daha önce alınmış mı?
    const { data: existing } = await supabase
      .from('companies')
      .select('id')
      .ilike('name', companyName.trim())
      .maybeSingle()

    if (existing) {
      setError('Bu firma adı zaten alınmış. Farklı bir isim deneyin.')
      setLoading(false)
      return
    }

    // Auth kaydı
    const { data, error: authError } = await supabase.auth.signUp({ email, password })
    if (authError || !data.user) {
      setError(authError?.message || 'Kayıt başarısız')
      setLoading(false)
      return
    }

    // Company oluştur
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .insert({ name: companyName.trim() })
      .select()
      .single()

    if (companyError || !company) {
      setError('Firma oluşturulamadı')
      setLoading(false)
      return
    }

    // Profile oluştur
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({ id: data.user.id, company_id: company.id })

    if (profileError) {
      setError('Profil oluşturulamadı')
      setLoading(false)
      return
    }

    router.push('/dashboard')
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0b1120", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: "420px", padding: "40px", background: "#1e293b", borderRadius: "16px", border: "1px solid #334155" }}>
        <h1 style={{ color: "white", fontSize: "22px", fontWeight: "bold", marginBottom: "8px" }}>Kayıt Ol</h1>
        <p style={{ color: "#64748b", fontSize: "13px", marginBottom: "28px" }}>Telecom Exchange'e hoş geldiniz</p>

        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label style={{ color: "#94a3b8", fontSize: "13px", display: "block", marginBottom: "6px" }}>Firma Adı *</label>
            <input
              placeholder="Şirketinizin adı"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #334155", background: "#0f172a", color: "white", fontSize: "14px", boxSizing: "border-box" }}
            />
          </div>

          <div>
            <label style={{ color: "#94a3b8", fontSize: "13px", display: "block", marginBottom: "6px" }}>Email *</label>
            <input
              placeholder="email@firma.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #334155", background: "#0f172a", color: "white", fontSize: "14px", boxSizing: "border-box" }}
            />
          </div>

          <div>
            <label style={{ color: "#94a3b8", fontSize: "13px", display: "block", marginBottom: "6px" }}>Şifre *</label>
            <input
              placeholder="En az 6 karakter"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #334155", background: "#0f172a", color: "white", fontSize: "14px", boxSizing: "border-box" }}
            />
          </div>

          {error && (
            <div style={{ padding: "10px 14px", background: "#450a0a", border: "1px solid #991b1b", borderRadius: "8px", color: "#fca5a5", fontSize: "13px" }}>
              {error}
            </div>
          )}

          <button
            onClick={handleRegister}
            disabled={loading}
            style={{ padding: "12px", background: loading ? "#1d4ed8" : "#2563eb", color: "white", border: "none", borderRadius: "8px", cursor: loading ? "not-allowed" : "pointer", fontSize: "14px", fontWeight: "600", marginTop: "4px" }}
          >
            {loading ? 'Kaydediliyor...' : 'Kayıt Ol'}
          </button>

          <a href="/login" style={{ color: "#64748b", fontSize: "13px", textAlign: "center", textDecoration: "none" }}>
            Hesabın var mı? <span style={{ color: "#60a5fa" }}>Giriş yap</span>
          </a>
        </div>
      </div>
    </div>
  )
}
