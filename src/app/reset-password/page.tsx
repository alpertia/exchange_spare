"use client"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Token URL'den otomatik okunur, session kurulur
    supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true)
      }
    })
  }, [])

  const handleReset = async () => {
    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters")
      return
    }
    if (password !== confirm) {
      setError("Passwords do not match")
      return
    }
    setLoading(true)
    setError("")
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setSuccess(true)
    setTimeout(() => router.push("/login"), 2500)
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
          <h2 style={{ fontSize: "22px", fontWeight: "bold", margin: 0 }}>Set New Password</h2>
          <p style={{ color: "#64748b", fontSize: "13px", margin: "6px 0 0" }}>SpareShare B2B Exchange</p>
        </div>

        {success ? (
          <div style={{
            padding: "16px",
            background: "#052e16",
            border: "1px solid #166534",
            borderRadius: "8px",
            color: "#86efac",
            fontSize: "13px"
          }}>
            ✅ Password updated! Redirecting to login...
          </div>
        ) : (
          <>
            <div>
              <label style={{ color: "#94a3b8", fontSize: "13px", display: "block", marginBottom: "6px" }}>New Password</label>
              <input
                type="password"
                placeholder="Min. 8 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
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
              <label style={{ color: "#94a3b8", fontSize: "13px", display: "block", marginBottom: "6px" }}>Confirm Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleReset()}
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
              onClick={handleReset}
              disabled={loading || !ready}
              style={{
                padding: "12px",
                background: loading || !ready ? "#1d4ed8" : "#2563eb",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: loading || !ready ? "not-allowed" : "pointer",
                fontSize: "14px",
                fontWeight: "600",
                marginTop: "4px"
              }}
            >
              {loading ? "Updating..." : !ready ? "Loading..." : "Update Password"}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
