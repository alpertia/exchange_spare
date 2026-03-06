import Link from "next/link"

export default function Home() {
  return (
    <div style={{ padding: "100px", color: "white", background: "#0b1120", minHeight: "100vh" }}>
      <h1>Global Telecom Exchange</h1>
      <p style={{ marginTop: "20px", opacity: 0.8 }}>
        Neutral infrastructure for telecom equipment trading.
      </p>

      <div style={{ marginTop: "40px" }}>
        <Link href="/dashboard" style={{
          background:"#1e293b",
          padding:"12px 20px",
          borderRadius:"8px"
        }}>
          Enter Dashboard
        </Link>
      </div>
    </div>
  )
}