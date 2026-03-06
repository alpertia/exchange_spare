"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError("Email and password is compulsory")
      return
    }

    setLoading(true)
    setError("")

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    router.push("/dashboard")
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      background: "#0b1120",
      color: "white"
    }}>
      <div style={{
        width: "100%",
        maxWidth: "400px",
        padding: "40px",
        background: "#1e293b",
        borderRadius: "16px",
        border: "1px solid #334155",
        display: "flex",
        flexDirection: "column",
        gap: "14px"
      }}>
        <div style={{ marginBottom: "8px" }}>
          <h2 style={{ fontSize: "22px", fontWeight: "bold", margin: 0 }}>Login </h2>
          <p style={{ color: "#64748b", fontSize: "13px", margin: "6px 0 0" }}>
            SpareShare B2B Exchange
          </p>
        </div>

        <div>
          <label style={{ color: "#94a3b8", fontSize: "13px", display: "block", marginBottom: "6px" }}>Email</label>
          <input
            type="email"
            placeholder="email@firma.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "8px",
              border: "1px solid #334155",
              background: "#0f172a",
              color: "white",
              fontSize: "14px",
              boxSizing: "border-box"
            }}
          />
        </div>

        <div>
          <label style={{ color: "#94a3b8", fontSize: "13px", display: "block", marginBottom: "6px" }}>Şifre</label>
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "8px",
              border: "1px solid #334155",
              background: "#0f172a",
              color: "white",
              fontSize: "14px",
              boxSizing: "border-box"
            }}
          />
        </div>

        {error && (
          <div style={{
            padding: "10px 14px",
            background: "#450a0a",
            border: "1px solid #991b1b",
            borderRadius: "8px",
            color: "#fca5a5",
            fontSize: "13px"
          }}>
            {error}
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            padding: "12px",
            background: loading ? "#1d4ed8" : "#2563eb",
            color: "white",
            border: "none",
            borderRadius: "8px",
            cursor: loading ? "not-allowed" : "pointer",
            fontSize: "14px",
            fontWeight: "600",
            marginTop: "4px"
          }}
        >
          {loading ? "Login process..." : "Login"}
        </button>

        <a
          href="/register"
          style={{ color: "#64748b", fontSize: "13px", textAlign: "center", textDecoration: "none" }}
        >
          Hesabın yok mu? <span style={{ color: "#60a5fa" }}>Kayıt ol</span>
        </a>
      </div>
    </div>
  )
}
