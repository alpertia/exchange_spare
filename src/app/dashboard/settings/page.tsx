"use client"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"

type Profile = {
  id: string
  full_name: string
  role: string
  company_id: string
}

type Company = {
  id: string
  name: string
  plan_type: string | null
}

const sectionStyle = {
  background: "white",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  padding: 24,
  marginBottom: 20,
}

const labelStyle = {
  fontSize: 12,
  color: "#64748b",
  display: "block" as const,
  marginBottom: 4,
  fontWeight: 600 as const,
}

const inputStyle = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 6,
  border: "1px solid #e2e8f0",
  background: "#f8fafc",
  color: "#0f172a",
  fontSize: 14,
  boxSizing: "border-box" as const,
  outline: "none",
}

const inputReadonly = {
  ...inputStyle,
  background: "#f1f5f9",
  color: "#64748b",
  cursor: "not-allowed" as const,
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [company, setCompany] = useState<Company | null>(null)
  const [fullName, setFullName] = useState("")
  const [companyName, setCompanyName] = useState("")

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  const [profileSaving, setProfileSaving] = useState(false)
  const [companySaving, setCompanySaving] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)

  const [profileMsg, setProfileMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null)
  const [companyMsg, setCompanyMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null)
  const [passwordMsg, setPasswordMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null)

  const [userEmail, setUserEmail] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    init()
  }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setUserEmail(user.email || "")

    const { data: profileData } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single()

    if (!profileData) { setLoading(false); return }

    setProfile(profileData)
    setFullName(profileData.full_name || "")

    const { data: companyData } = await supabase
      .from("companies")
      .select("*")
      .eq("id", profileData.company_id)
      .single()

    if (companyData) {
      setCompany(companyData)
      setCompanyName(companyData.name || "")
    }

    setLoading(false)
  }

  async function saveProfile() {
    if (!profile) return
    setProfileSaving(true)
    setProfileMsg(null)

    const cleanName = fullName.trim()
    if (!cleanName) {
      setProfileMsg({ type: "err", text: "Full name cannot be empty." })
      setProfileSaving(false)
      return
    }

    const { error } = await supabase
      .from("profiles")
      .update({ full_name: cleanName })
      .eq("id", profile.id)

    if (error) {
      setProfileMsg({ type: "err", text: error.message })
    } else {
      setProfileMsg({ type: "ok", text: "Profile updated successfully." })
    }
    setProfileSaving(false)
  }

  async function saveCompany() {
    if (!company || profile?.role !== "admin") return
    setCompanySaving(true)
    setCompanyMsg(null)

    const cleanName = companyName.trim()
    if (!cleanName) {
      setCompanyMsg({ type: "err", text: "Company name cannot be empty." })
      setCompanySaving(false)
      return
    }

    // Check if name taken
    const { data: existing } = await supabase
      .from("companies")
      .select("id")
      .ilike("name", cleanName)
      .neq("id", company.id)
      .maybeSingle()

    if (existing) {
      setCompanyMsg({ type: "err", text: "This company name is already taken." })
      setCompanySaving(false)
      return
    }

    const { error } = await supabase
      .from("companies")
      .update({ name: cleanName })
      .eq("id", company.id)

    if (error) {
      setCompanyMsg({ type: "err", text: error.message })
    } else {
      setCompanyMsg({ type: "ok", text: "Company name updated." })
      setCompany(prev => prev ? { ...prev, name: cleanName } : prev)
    }
    setCompanySaving(false)
  }

  async function changePassword() {
    setPasswordSaving(true)
    setPasswordMsg(null)

    if (!newPassword || newPassword.length < 6) {
      setPasswordMsg({ type: "err", text: "New password must be at least 6 characters." })
      setPasswordSaving(false)
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: "err", text: "Passwords do not match." })
      setPasswordSaving(false)
      return
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword })

    if (error) {
      setPasswordMsg({ type: "err", text: error.message })
    } else {
      setPasswordMsg({ type: "ok", text: "Password changed successfully." })
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    }
    setPasswordSaving(false)
  }

  if (loading) {
    return (
      <div style={{ color: "#64748b", padding: 40 }}>Loading settings...</div>
    )
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", marginBottom: 24 }}>Settings</h1>

      {/* PROFILE SECTION */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: "0 0 16px" }}>Profile</h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={labelStyle}>Email</label>
            <input value={userEmail} readOnly style={inputReadonly} />
          </div>

          <div>
            <label style={labelStyle}>Role</label>
            <input value={profile?.role || ""} readOnly style={inputReadonly} />
          </div>

          <div>
            <label style={labelStyle}>Full Name</label>
            <input
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              style={inputStyle}
              placeholder="Your full name"
            />
          </div>

          {profileMsg && (
            <div style={{
              padding: "9px 12px",
              borderRadius: 6,
              fontSize: 13,
              background: profileMsg.type === "ok" ? "#f0fdf4" : "#fef2f2",
              border: `1px solid ${profileMsg.type === "ok" ? "#bbf7d0" : "#fecaca"}`,
              color: profileMsg.type === "ok" ? "#16a34a" : "#dc2626",
            }}>
              {profileMsg.text}
            </div>
          )}

          <button
            onClick={saveProfile}
            disabled={profileSaving}
            style={{
              padding: "10px 20px",
              background: profileSaving ? "#93c5fd" : "#2563eb",
              color: "white",
              border: "none",
              borderRadius: 6,
              cursor: profileSaving ? "not-allowed" : "pointer",
              fontWeight: 600,
              fontSize: 14,
              alignSelf: "flex-start",
            }}
          >
            {profileSaving ? "Saving..." : "Save Profile"}
          </button>
        </div>
      </div>

      {/* COMPANY SECTION */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: "0 0 4px" }}>Company</h2>
        {profile?.role !== "admin" && (
          <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 16px" }}>Only admins can edit company settings.</p>
        )}
        {profile?.role === "admin" && (
          <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 16px" }}>
            Plan: <strong>{company?.plan_type || "free"}</strong>
          </p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={labelStyle}>Company Name</label>
            <input
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              style={profile?.role === "admin" ? inputStyle : inputReadonly}
              readOnly={profile?.role !== "admin"}
              placeholder="Company name"
            />
          </div>

          {companyMsg && (
            <div style={{
              padding: "9px 12px",
              borderRadius: 6,
              fontSize: 13,
              background: companyMsg.type === "ok" ? "#f0fdf4" : "#fef2f2",
              border: `1px solid ${companyMsg.type === "ok" ? "#bbf7d0" : "#fecaca"}`,
              color: companyMsg.type === "ok" ? "#16a34a" : "#dc2626",
            }}>
              {companyMsg.text}
            </div>
          )}

          {profile?.role === "admin" && (
            <button
              onClick={saveCompany}
              disabled={companySaving}
              style={{
                padding: "10px 20px",
                background: companySaving ? "#93c5fd" : "#2563eb",
                color: "white",
                border: "none",
                borderRadius: 6,
                cursor: companySaving ? "not-allowed" : "pointer",
                fontWeight: 600,
                fontSize: 14,
                alignSelf: "flex-start",
              }}
            >
              {companySaving ? "Saving..." : "Save Company"}
            </button>
          )}
        </div>
      </div>

      {/* PASSWORD SECTION */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: "0 0 16px" }}>Change Password</h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={labelStyle}>New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              style={inputStyle}
              placeholder="At least 6 characters"
            />
          </div>

          <div>
            <label style={labelStyle}>Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              style={inputStyle}
              placeholder="Repeat new password"
            />
          </div>

          {passwordMsg && (
            <div style={{
              padding: "9px 12px",
              borderRadius: 6,
              fontSize: 13,
              background: passwordMsg.type === "ok" ? "#f0fdf4" : "#fef2f2",
              border: `1px solid ${passwordMsg.type === "ok" ? "#bbf7d0" : "#fecaca"}`,
              color: passwordMsg.type === "ok" ? "#16a34a" : "#dc2626",
            }}>
              {passwordMsg.text}
            </div>
          )}

          <button
            onClick={changePassword}
            disabled={passwordSaving}
            style={{
              padding: "10px 20px",
              background: passwordSaving ? "#93c5fd" : "#2563eb",
              color: "white",
              border: "none",
              borderRadius: 6,
              cursor: passwordSaving ? "not-allowed" : "pointer",
              fontWeight: 600,
              fontSize: 14,
              alignSelf: "flex-start",
            }}
          >
            {passwordSaving ? "Changing..." : "Change Password"}
          </button>
        </div>
      </div>

      {/* DANGER ZONE */}
      <div style={{ ...sectionStyle, border: "1px solid #fecaca" }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "#dc2626", margin: "0 0 8px" }}>Sign Out</h2>
        <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 16px" }}>
          Sign out from your current session.
        </p>
        <button
          onClick={async () => {
            await supabase.auth.signOut()
            window.location.href = "/login"
          }}
          style={{
            padding: "9px 18px",
            background: "white",
            color: "#dc2626",
            border: "1px solid #fecaca",
            borderRadius: 6,
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          Sign Out
        </button>
      </div>
    </div>
  )
}
